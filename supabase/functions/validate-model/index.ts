import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { fetchMarketData } from '../_shared/market-data-fetcher.ts';
import { deserializeModel } from '../_shared/recurrent-ppo-model.ts';
import { 
  createWindows, 
  validateWindow, 
  generateReport, 
  WalkForwardConfig,
  checkConsistency 
} from '../_shared/walk-forward-validator.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { modelId, asset, startDate, endDate, config } = await req.json();

    console.log(`🔍 Starting walk-forward validation for model ${modelId} on ${asset}`);

    // 1. Fetch trained model
    const { data: modelData, error: modelError } = await supabase
      .from('asset_models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (modelError || !modelData) {
      throw new Error(`Model not found: ${modelError?.message}`);
    }

    console.log(`✅ Loaded model for ${modelData.symbol}`);

    // 2. Fetch historical data
    const historicalData = await fetchMarketData(asset, '1d', startDate, endDate);

    if (!historicalData || historicalData.length < 126) { // ~6 months minimum
      throw new Error(`Insufficient data for validation: need at least 6 months (126 bars), got ${historicalData?.length || 0}`);
    }

    console.log(`✅ Fetched ${historicalData.length} bars of data`);

    // 3. Parse configuration
    const validationConfig: WalkForwardConfig = {
      trainMonths: config?.trainMonths || 3,
      testMonths: config?.testMonths || 1,
      minTradeCount: config?.minTradeCount || 15,
      minWinRate: config?.minWinRate || 0.43,
      minSharpe: config?.minSharpe || 0.3,
      maxDrawdown: config?.maxDrawdown || 0.25
    };

    // 4. Create validation windows
    const windows = createWindows(historicalData, validationConfig);

    if (windows.length < 2) {
      throw new Error(`Insufficient windows: need at least 2, got ${windows.length}. Try shorter train/test periods or more data.`);
    }

    console.log(`✅ Created ${windows.length} validation windows`);

    // 5. Deserialize model
    const model = deserializeModel(JSON.stringify(modelData.model_weights));

    // 6. Validate each window
    const windowResults = [];
    for (let i = 0; i < windows.length; i++) {
      console.log(`\n📊 Processing window ${i + 1}/${windows.length}`);
      const result = validateWindow(model, windows[i], historicalData, validationConfig);
      windowResults.push(result);

      // Store window details in database
      const { error: windowError } = await supabase
        .from('validation_window_details')
        .insert({
          validation_id: null, // Will update after creating validation record
          window_number: i + 1,
          train_start_bar: result.window.trainStart,
          train_end_bar: result.window.trainEnd,
          test_start_bar: result.window.testStart,
          test_end_bar: result.window.testEnd,
          window_label: result.window.label,
          train_trades: result.trainTrades,
          train_win_rate: result.trainWinRate,
          train_sharpe: result.trainSharpe,
          train_max_drawdown: result.trainMaxDrawdown,
          test_trades: result.testTrades,
          test_win_rate: result.testWinRate,
          test_sharpe: result.testSharpe,
          test_max_drawdown: result.testMaxDrawdown,
          test_pnl: result.testPnL,
          passed: result.passed,
          failure_reasons: result.failureReasons
        });

      if (windowError) {
        console.error('⚠️ Failed to store window details:', windowError);
      }
    }

    // 7. Generate validation report
    const report = generateReport(asset, windowResults, validationConfig);

    // 8. Check consistency
    const consistencyCheck = checkConsistency(windowResults);
    if (!consistencyCheck.consistent) {
      console.warn('⚠️ Consistency issues detected:');
      consistencyCheck.issues.forEach(issue => console.warn(`  - ${issue}`));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(report.recommendation);
    console.log(`${'='.repeat(60)}`);

    // 9. Store validation report
    const { data: validationRecord, error: validationError } = await supabase
      .from('model_validations')
      .insert({
        model_id: modelId,
        asset: asset,
        train_months: validationConfig.trainMonths,
        test_months: validationConfig.testMonths,
        total_windows: report.totalWindows,
        passed_windows: report.passedWindows,
        failed_windows: report.failedWindows,
        avg_test_win_rate: report.avgTestWinRate,
        avg_test_sharpe: report.avgTestSharpe,
        avg_test_drawdown: report.avgTestDrawdown,
        total_test_pnl: report.totalTestPnL,
        win_rate_std_dev: report.winRateStdDev,
        sharpe_std_dev: report.sharpeStdDev,
        approved: report.approved,
        recommendation: report.recommendation,
        full_report: report as any
      })
      .select()
      .single();

    if (validationError) {
      throw new Error(`Failed to store validation: ${validationError.message}`);
    }

    // 10. Update window details with validation_id
    const { error: updateError } = await supabase
      .from('validation_window_details')
      .update({ validation_id: validationRecord.id })
      .is('validation_id', null)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Last minute

    if (updateError) {
      console.error('⚠️ Failed to link window details:', updateError);
    }

    // 11. Update model status based on validation result
    const newModelStatus = report.approved ? 'active' : 'failed_validation';
    const { error: statusError } = await supabase
      .from('asset_models')
      .update({ 
        model_status: newModelStatus, // ✅ Set model_status for signal generation
        updated_at: new Date().toISOString(),
        performance_metrics: {
          ...(modelData.performance_metrics || {}),
          validation_status: newModelStatus,
          validation_id: validationRecord.id,
          last_validated: new Date().toISOString()
        }
      })
      .eq('id', modelId);

    if (statusError) {
      console.error('⚠️ Failed to update model status:', statusError);
    }

    console.log(`✅ Validation complete. Model status: ${newModelStatus}`);

    return new Response(JSON.stringify({
      success: true,
      approved: report.approved,
      report: {
        ...report,
        validationId: validationRecord.id,
        consistencyCheck
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Validation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
