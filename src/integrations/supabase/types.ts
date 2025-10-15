export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      api_usage: {
        Row: {
          id: number
          key_name: string
          used_at: string | null
        }
        Insert: {
          id?: number
          key_name: string
          used_at?: string | null
        }
        Update: {
          id?: number
          key_name?: string
          used_at?: string | null
        }
        Relationships: []
      }
      asset_models: {
        Row: {
          action_space: Json | null
          base_model_id: string | null
          created_at: string | null
          curriculum_stage: string | null
          fine_tuning_metadata: Json | null
          hidden_size: number | null
          id: string
          metadata_storage_path: string | null
          model_architecture: string | null
          model_status: string | null
          model_storage_path: string | null
          model_type: string
          model_version: number | null
          model_weights: Json
          performance_metrics: Json | null
          sequence_length: number | null
          structural_features: Json | null
          symbol: string
          training_data_points: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_space?: Json | null
          base_model_id?: string | null
          created_at?: string | null
          curriculum_stage?: string | null
          fine_tuning_metadata?: Json | null
          hidden_size?: number | null
          id?: string
          metadata_storage_path?: string | null
          model_architecture?: string | null
          model_status?: string | null
          model_storage_path?: string | null
          model_type: string
          model_version?: number | null
          model_weights: Json
          performance_metrics?: Json | null
          sequence_length?: number | null
          structural_features?: Json | null
          symbol: string
          training_data_points?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_space?: Json | null
          base_model_id?: string | null
          created_at?: string | null
          curriculum_stage?: string | null
          fine_tuning_metadata?: Json | null
          hidden_size?: number | null
          id?: string
          metadata_storage_path?: string | null
          model_architecture?: string | null
          model_status?: string | null
          model_storage_path?: string | null
          model_type?: string
          model_version?: number | null
          model_weights?: Json
          performance_metrics?: Json | null
          sequence_length?: number | null
          structural_features?: Json | null
          symbol?: string
          training_data_points?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_models_base_model_id_fkey"
            columns: ["base_model_id"]
            isOneToOne: false
            referencedRelation: "base_models"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_jobs: {
        Row: {
          attempt_count: number
          backtest_run_id: string
          batch_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          period: string
          priority: number
          results: Json | null
          risk_level: string
          started_at: string | null
          status: string
          symbol: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          backtest_run_id: string
          batch_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          period: string
          priority?: number
          results?: Json | null
          risk_level: string
          started_at?: string | null
          status?: string
          symbol: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          backtest_run_id?: string
          batch_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          period?: string
          priority?: number
          results?: Json | null
          risk_level?: string
          started_at?: string | null
          status?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_jobs_backtest_run_id_fkey"
            columns: ["backtest_run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_runs: {
        Row: {
          aggregate_results: Json | null
          batch_id: string
          completed_at: string | null
          completed_symbols: number
          created_at: string
          error_message: string | null
          failed_symbols: number
          id: string
          period: string
          risk_level: string
          started_at: string | null
          status: string
          symbols: string[]
          total_symbols: number
          user_id: string
        }
        Insert: {
          aggregate_results?: Json | null
          batch_id: string
          completed_at?: string | null
          completed_symbols?: number
          created_at?: string
          error_message?: string | null
          failed_symbols?: number
          id?: string
          period: string
          risk_level: string
          started_at?: string | null
          status?: string
          symbols: string[]
          total_symbols: number
          user_id: string
        }
        Update: {
          aggregate_results?: Json | null
          batch_id?: string
          completed_at?: string | null
          completed_symbols?: number
          created_at?: string
          error_message?: string | null
          failed_symbols?: number
          id?: string
          period?: string
          risk_level?: string
          started_at?: string | null
          status?: string
          symbols?: string[]
          total_symbols?: number
          user_id?: string
        }
        Relationships: []
      }
      backtest_trades: {
        Row: {
          action: string
          backtest_run_id: string
          confidence: number
          created_at: string
          duration_minutes: number | null
          exit_price: number | null
          exit_timestamp: string | null
          id: string
          indicators: Json | null
          outcome: string | null
          pnl: number | null
          price: number
          quantity: number
          symbol: string
          timestamp: string
        }
        Insert: {
          action: string
          backtest_run_id: string
          confidence: number
          created_at?: string
          duration_minutes?: number | null
          exit_price?: number | null
          exit_timestamp?: string | null
          id?: string
          indicators?: Json | null
          outcome?: string | null
          pnl?: number | null
          price: number
          quantity: number
          symbol: string
          timestamp: string
        }
        Update: {
          action?: string
          backtest_run_id?: string
          confidence?: number
          created_at?: string
          duration_minutes?: number | null
          exit_price?: number | null
          exit_timestamp?: string | null
          id?: string
          indicators?: Json | null
          outcome?: string | null
          pnl?: number | null
          price?: number
          quantity?: number
          symbol?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_trades_backtest_run_id_fkey"
            columns: ["backtest_run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      base_models: {
        Row: {
          assets_trained_on: string[]
          created_at: string | null
          id: string
          model_type: string
          model_weights: Json
          performance_metrics: Json | null
          training_metadata: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assets_trained_on: string[]
          created_at?: string | null
          id?: string
          model_type?: string
          model_weights: Json
          performance_metrics?: Json | null
          training_metadata?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assets_trained_on?: string[]
          created_at?: string | null
          id?: string
          model_type?: string
          model_weights?: Json
          performance_metrics?: Json | null
          training_metadata?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      batch_training_jobs: {
        Row: {
          attempt_count: number
          batch_id: string
          completed_at: string | null
          created_at: string
          curriculum_stage: string | null
          error_message: string | null
          id: string
          performance_metrics: Json | null
          priority: number
          started_at: string | null
          status: string
          symbol: string
          training_data_points: number | null
          updated_at: string
          use_augmentation: boolean | null
          user_id: string
        }
        Insert: {
          attempt_count?: number
          batch_id: string
          completed_at?: string | null
          created_at?: string
          curriculum_stage?: string | null
          error_message?: string | null
          id?: string
          performance_metrics?: Json | null
          priority?: number
          started_at?: string | null
          status?: string
          symbol: string
          training_data_points?: number | null
          updated_at?: string
          use_augmentation?: boolean | null
          user_id: string
        }
        Update: {
          attempt_count?: number
          batch_id?: string
          completed_at?: string | null
          created_at?: string
          curriculum_stage?: string | null
          error_message?: string | null
          id?: string
          performance_metrics?: Json | null
          priority?: number
          started_at?: string | null
          status?: string
          symbol?: string
          training_data_points?: number | null
          updated_at?: string
          use_augmentation?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      bot_adaptive_parameters: {
        Row: {
          average_profit: number | null
          confidence_threshold: number | null
          confluence_threshold: number | null
          created_at: string
          id: string
          last_updated: string
          stop_loss_multiplier: number | null
          success_rate: number | null
          symbol: string
          take_profit_multiplier: number | null
          total_trades: number | null
          user_id: string
          winning_trades: number | null
        }
        Insert: {
          average_profit?: number | null
          confidence_threshold?: number | null
          confluence_threshold?: number | null
          created_at?: string
          id?: string
          last_updated?: string
          stop_loss_multiplier?: number | null
          success_rate?: number | null
          symbol: string
          take_profit_multiplier?: number | null
          total_trades?: number | null
          user_id: string
          winning_trades?: number | null
        }
        Update: {
          average_profit?: number | null
          confidence_threshold?: number | null
          confluence_threshold?: number | null
          created_at?: string
          id?: string
          last_updated?: string
          stop_loss_multiplier?: number | null
          success_rate?: number | null
          symbol?: string
          take_profit_multiplier?: number | null
          total_trades?: number | null
          user_id?: string
          winning_trades?: number | null
        }
        Relationships: []
      }
      broker_assets: {
        Row: {
          asset: string
          broker_id: string
          broker_symbol: string
          created_at: string
          id: string
          min_notional: number
          min_qty: number
          step_size: number
          tick_size: number
          trading_session: string | null
          updated_at: string
        }
        Insert: {
          asset: string
          broker_id: string
          broker_symbol: string
          created_at?: string
          id?: string
          min_notional?: number
          min_qty?: number
          step_size?: number
          tick_size?: number
          trading_session?: string | null
          updated_at?: string
        }
        Update: {
          asset?: string
          broker_id?: string
          broker_symbol?: string
          created_at?: string
          id?: string
          min_notional?: number
          min_qty?: number
          step_size?: number
          tick_size?: number
          trading_session?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_assets_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_connections: {
        Row: {
          auth_type: string
          broker_id: string
          created_at: string
          encrypted_api_key: string | null
          encrypted_api_secret: string | null
          encrypted_credentials: Json
          error_message: string | null
          id: string
          key_id: string | null
          last_checked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_type: string
          broker_id: string
          created_at?: string
          encrypted_api_key?: string | null
          encrypted_api_secret?: string | null
          encrypted_credentials: Json
          error_message?: string | null
          id?: string
          key_id?: string | null
          last_checked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_type?: string
          broker_id?: string
          created_at?: string
          encrypted_api_key?: string | null
          encrypted_api_secret?: string | null
          encrypted_credentials?: Json
          error_message?: string | null
          id?: string
          key_id?: string | null
          last_checked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_connections_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          supports_crypto: boolean
          supports_fractional: boolean
          supports_futures: boolean
          supports_margin: boolean
          supports_oco: boolean
          supports_stocks: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          supports_crypto?: boolean
          supports_fractional?: boolean
          supports_futures?: boolean
          supports_margin?: boolean
          supports_oco?: boolean
          supports_stocks?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          supports_crypto?: boolean
          supports_fractional?: boolean
          supports_futures?: boolean
          supports_margin?: boolean
          supports_oco?: boolean
          supports_stocks?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bybit_usage: {
        Row: {
          api_key_name: string
          created_at: string | null
          endpoint: string | null
          id: number
          key_mask: string | null
          notes: string | null
          response_code: number | null
          response_json: Json | null
          success: boolean | null
        }
        Insert: {
          api_key_name: string
          created_at?: string | null
          endpoint?: string | null
          id?: number
          key_mask?: string | null
          notes?: string | null
          response_code?: number | null
          response_json?: Json | null
          success?: boolean | null
        }
        Update: {
          api_key_name?: string
          created_at?: string | null
          endpoint?: string | null
          id?: number
          key_mask?: string | null
          notes?: string | null
          response_code?: number | null
          response_json?: Json | null
          success?: boolean | null
        }
        Relationships: []
      }
      circuit_breaker_state: {
        Row: {
          created_at: string
          failure_count: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          opened_at: string | null
          service_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          service_name: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          service_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_job_history: {
        Row: {
          completed_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          job_name: string
          started_at?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      episodes: {
        Row: {
          asset: string
          bucket_uri: string | null
          created_at: string
          end_ts: string | null
          id: string
          metadata: Json | null
          pnl: number | null
          reward_sum: number | null
          start_ts: string
          user_id: string
          version: string
        }
        Insert: {
          asset: string
          bucket_uri?: string | null
          created_at?: string
          end_ts?: string | null
          id?: string
          metadata?: Json | null
          pnl?: number | null
          reward_sum?: number | null
          start_ts: string
          user_id: string
          version: string
        }
        Update: {
          asset?: string
          bucket_uri?: string | null
          created_at?: string
          end_ts?: string | null
          id?: string
          metadata?: Json | null
          pnl?: number | null
          reward_sum?: number | null
          start_ts?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      executions: {
        Row: {
          asset: string
          broker_id: string
          created_at: string
          executed_price: number | null
          executed_qty: number | null
          id: string
          latency_ms: number | null
          order_id: string | null
          qty: number
          raw_response: Json | null
          side: string
          signal_id: string
          status: string
          user_id: string
        }
        Insert: {
          asset: string
          broker_id: string
          created_at?: string
          executed_price?: number | null
          executed_qty?: number | null
          id?: string
          latency_ms?: number | null
          order_id?: string | null
          qty: number
          raw_response?: Json | null
          side: string
          signal_id: string
          status: string
          user_id: string
        }
        Update: {
          asset?: string
          broker_id?: string
          created_at?: string
          executed_price?: number | null
          executed_qty?: number | null
          id?: string
          latency_ms?: number | null
          order_id?: string | null
          qty?: number
          raw_response?: Json | null
          side?: string
          signal_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "executions_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      infrastructure_costs: {
        Row: {
          cost_breakdown: Json | null
          created_at: string
          database_egress_gb: number
          database_storage_gb: number
          edge_function_invocations: number
          estimated_cost: number
          id: string
          metric_date: string
        }
        Insert: {
          cost_breakdown?: Json | null
          created_at?: string
          database_egress_gb?: number
          database_storage_gb?: number
          edge_function_invocations?: number
          estimated_cost?: number
          id?: string
          metric_date: string
        }
        Update: {
          cost_breakdown?: Json | null
          created_at?: string
          database_egress_gb?: number
          database_storage_gb?: number
          edge_function_invocations?: number
          estimated_cost?: number
          id?: string
          metric_date?: string
        }
        Relationships: []
      }
      market_data: {
        Row: {
          created_at: string
          current_price: number | null
          id: string
          last_updated: string
          market_cap: number | null
          pe_ratio: number | null
          price_change: number | null
          price_change_percent: number | null
          raw_data: Json | null
          symbol: string
          volume: number | null
        }
        Insert: {
          created_at?: string
          current_price?: number | null
          id?: string
          last_updated?: string
          market_cap?: number | null
          pe_ratio?: number | null
          price_change?: number | null
          price_change_percent?: number | null
          raw_data?: Json | null
          symbol: string
          volume?: number | null
        }
        Update: {
          created_at?: string
          current_price?: number | null
          id?: string
          last_updated?: string
          market_cap?: number | null
          pe_ratio?: number | null
          price_change?: number | null
          price_change_percent?: number | null
          raw_data?: Json | null
          symbol?: string
          volume?: number | null
        }
        Relationships: []
      }
      model_evaluation_metrics: {
        Row: {
          avg_confluence_score: number | null
          avg_sl_distance_atr: number | null
          avg_tp_distance_atr: number | null
          created_at: string | null
          details: Json | null
          evaluation_type: string
          fib_alignment_ratio: number | null
          id: string
          long_payoff_ratio: number | null
          long_win_rate: number | null
          mar: number | null
          max_drawdown: number | null
          model_id: string | null
          passed_acceptance: boolean | null
          sharpe_ratio: number | null
          short_payoff_ratio: number | null
          short_win_rate: number | null
          sortino_ratio: number | null
          total_trades: number | null
          win_rate: number | null
        }
        Insert: {
          avg_confluence_score?: number | null
          avg_sl_distance_atr?: number | null
          avg_tp_distance_atr?: number | null
          created_at?: string | null
          details?: Json | null
          evaluation_type: string
          fib_alignment_ratio?: number | null
          id?: string
          long_payoff_ratio?: number | null
          long_win_rate?: number | null
          mar?: number | null
          max_drawdown?: number | null
          model_id?: string | null
          passed_acceptance?: boolean | null
          sharpe_ratio?: number | null
          short_payoff_ratio?: number | null
          short_win_rate?: number | null
          sortino_ratio?: number | null
          total_trades?: number | null
          win_rate?: number | null
        }
        Update: {
          avg_confluence_score?: number | null
          avg_sl_distance_atr?: number | null
          avg_tp_distance_atr?: number | null
          created_at?: string | null
          details?: Json | null
          evaluation_type?: string
          fib_alignment_ratio?: number | null
          id?: string
          long_payoff_ratio?: number | null
          long_win_rate?: number | null
          mar?: number | null
          max_drawdown?: number | null
          model_id?: string | null
          passed_acceptance?: boolean | null
          sharpe_ratio?: number | null
          short_payoff_ratio?: number | null
          short_win_rate?: number | null
          sortino_ratio?: number | null
          total_trades?: number | null
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_evaluation_metrics_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "asset_models"
            referencedColumns: ["id"]
          },
        ]
      }
      model_metrics: {
        Row: {
          asset: string
          avg_rr: number | null
          id: string
          max_dd: number | null
          profitable_trades: number | null
          sharpe: number | null
          total_trades: number | null
          updated_at: string
          version: string
          win_rate: number | null
        }
        Insert: {
          asset: string
          avg_rr?: number | null
          id?: string
          max_dd?: number | null
          profitable_trades?: number | null
          sharpe?: number | null
          total_trades?: number | null
          updated_at?: string
          version: string
          win_rate?: number | null
        }
        Update: {
          asset?: string
          avg_rr?: number | null
          id?: string
          max_dd?: number | null
          profitable_trades?: number | null
          sharpe?: number | null
          total_trades?: number | null
          updated_at?: string
          version?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      model_validations: {
        Row: {
          approved: boolean
          asset: string
          avg_test_drawdown: number | null
          avg_test_sharpe: number | null
          avg_test_win_rate: number | null
          created_at: string
          failed_windows: number
          full_report: Json
          id: string
          model_id: string | null
          passed_windows: number
          recommendation: string | null
          sharpe_std_dev: number | null
          test_months: number
          total_test_pnl: number | null
          total_windows: number
          train_months: number
          win_rate_std_dev: number | null
        }
        Insert: {
          approved?: boolean
          asset: string
          avg_test_drawdown?: number | null
          avg_test_sharpe?: number | null
          avg_test_win_rate?: number | null
          created_at?: string
          failed_windows: number
          full_report: Json
          id?: string
          model_id?: string | null
          passed_windows: number
          recommendation?: string | null
          sharpe_std_dev?: number | null
          test_months: number
          total_test_pnl?: number | null
          total_windows: number
          train_months: number
          win_rate_std_dev?: number | null
        }
        Update: {
          approved?: boolean
          asset?: string
          avg_test_drawdown?: number | null
          avg_test_sharpe?: number | null
          avg_test_win_rate?: number | null
          created_at?: string
          failed_windows?: number
          full_report?: Json
          id?: string
          model_id?: string | null
          passed_windows?: number
          recommendation?: string | null
          sharpe_std_dev?: number | null
          test_months?: number
          total_test_pnl?: number | null
          total_windows?: number
          train_months?: number
          win_rate_std_dev?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_validations_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "asset_models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          asset: string
          created_at: string
          id: string
          location: string
          metadata: Json | null
          model_type: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          asset: string
          created_at?: string
          id?: string
          location: string
          metadata?: Json | null
          model_type?: string
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          asset?: string
          created_at?: string
          id?: string
          location?: string
          metadata?: Json | null
          model_type?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      orchestrator_metrics: {
        Row: {
          avg_latency_ms: number | null
          created_at: string | null
          id: string
          run_timestamp: string
          signals_blocked: number
          signals_executed: number
          signals_generated: number
          users_processed: number
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string | null
          id?: string
          run_timestamp: string
          signals_blocked: number
          signals_executed: number
          signals_generated: number
          users_processed: number
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string | null
          id?: string
          run_timestamp?: string
          signals_blocked?: number
          signals_executed?: number
          signals_generated?: number
          users_processed?: number
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          asset: string
          closed_at: string | null
          created_at: string | null
          entry_price: number
          exit_price: number | null
          exit_reason: string | null
          id: string
          pnl: number | null
          qty: number
          side: string
          signal_id: string | null
          sl: number | null
          status: string
          tp: number | null
          user_id: string
        }
        Insert: {
          asset: string
          closed_at?: string | null
          created_at?: string | null
          entry_price: number
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          pnl?: number | null
          qty: number
          side: string
          signal_id?: string | null
          sl?: number | null
          status?: string
          tp?: number | null
          user_id: string
        }
        Update: {
          asset?: string
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          pnl?: number | null
          qty?: number
          side?: string
          signal_id?: string | null
          sl?: number | null
          status?: string
          tp?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          current_balance: number
          id: string
          initial_balance: number
          name: string
          total_pnl: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_balance?: number
          id?: string
          initial_balance?: number
          name?: string
          total_pnl?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_balance?: number
          id?: string
          initial_balance?: number
          name?: string
          total_pnl?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          average_price: number
          created_at: string
          current_price: number | null
          current_value: number | null
          id: string
          portfolio_id: string
          quantity: number
          symbol: string
          total_cost: number
          unrealized_pnl: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          average_price?: number
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          id?: string
          portfolio_id: string
          quantity?: number
          symbol: string
          total_cost?: number
          unrealized_pnl?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          average_price?: number
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          id?: string
          portfolio_id?: string
          quantity?: number
          symbol?: string
          total_cost?: number
          unrealized_pnl?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_log: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          ip_address: string
          request_count: number | null
          user_id: string | null
          window_start: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address: string
          request_count?: number | null
          user_id?: string | null
          window_start?: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: string
          request_count?: number | null
          user_id?: string | null
          window_start?: string
        }
        Relationships: []
      }
      report_history: {
        Row: {
          created_at: string
          delivered: boolean
          file_path: string | null
          generated_at: string
          id: string
          report_config: Json | null
          report_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          file_path?: string | null
          generated_at?: string
          id?: string
          report_config?: Json | null
          report_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered?: boolean
          file_path?: string | null
          generated_at?: string
          id?: string
          report_config?: Json | null
          report_type?: string
          user_id?: string
        }
        Relationships: []
      }
      risk_parameters: {
        Row: {
          auto_trading_enabled: boolean | null
          created_at: string
          id: string
          max_daily_trades: number | null
          max_position_size: number
          min_confidence_score: number | null
          portfolio_id: string
          ppo_buy_threshold: number
          ppo_fast_period: number
          ppo_sell_threshold: number
          ppo_signal_period: number
          ppo_slow_period: number
          stop_loss_percent: number
          take_profit_percent: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auto_trading_enabled?: boolean | null
          created_at?: string
          id?: string
          max_daily_trades?: number | null
          max_position_size?: number
          min_confidence_score?: number | null
          portfolio_id: string
          ppo_buy_threshold?: number
          ppo_fast_period?: number
          ppo_sell_threshold?: number
          ppo_signal_period?: number
          ppo_slow_period?: number
          stop_loss_percent?: number
          take_profit_percent?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auto_trading_enabled?: boolean | null
          created_at?: string
          id?: string
          max_daily_trades?: number | null
          max_position_size?: number
          min_confidence_score?: number | null
          portfolio_id?: string
          ppo_buy_threshold?: number
          ppo_fast_period?: number
          ppo_sell_threshold?: number
          ppo_signal_period?: number
          ppo_slow_period?: number
          stop_loss_percent?: number
          take_profit_percent?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_parameters_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      service_role_audit: {
        Row: {
          action: string
          created_at: string | null
          function_name: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          function_name: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          function_name?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          asset: string
          broker_id: string
          confluence_score: number | null
          created_at: string
          dedupe_key: string | null
          error_message: string | null
          executed_at: string | null
          fib_alignment: number | null
          id: string
          limit_price: number | null
          model_id: string | null
          model_version: string | null
          order_type: string
          qty: number
          sent_at: string | null
          side: string
          sl: number | null
          sl_tight: number | null
          status: string
          structural_features: Json | null
          tp: number | null
          tp_offset: number | null
          user_id: string
        }
        Insert: {
          asset: string
          broker_id: string
          confluence_score?: number | null
          created_at?: string
          dedupe_key?: string | null
          error_message?: string | null
          executed_at?: string | null
          fib_alignment?: number | null
          id?: string
          limit_price?: number | null
          model_id?: string | null
          model_version?: string | null
          order_type?: string
          qty: number
          sent_at?: string | null
          side: string
          sl?: number | null
          sl_tight?: number | null
          status?: string
          structural_features?: Json | null
          tp?: number | null
          tp_offset?: number | null
          user_id: string
        }
        Update: {
          asset?: string
          broker_id?: string
          confluence_score?: number | null
          created_at?: string
          dedupe_key?: string | null
          error_message?: string | null
          executed_at?: string | null
          fib_alignment?: number | null
          id?: string
          limit_price?: number | null
          model_id?: string | null
          model_version?: string | null
          order_type?: string
          qty?: number
          sent_at?: string | null
          side?: string
          sl?: number | null
          sl_tight?: number | null
          status?: string
          structural_features?: Json | null
          tp?: number | null
          tp_offset?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_analysis: {
        Row: {
          analysis_type: string
          company_name: string | null
          confidence_score: number | null
          created_at: string
          id: string
          llm_analysis: string
          market_data: Json | null
          recommendation: string | null
          sentiment_score: number | null
          symbol: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          analysis_type?: string
          company_name?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          llm_analysis: string
          market_data?: Json | null
          recommendation?: string | null
          sentiment_score?: number | null
          symbol: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          analysis_type?: string
          company_name?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          llm_analysis?: string
          market_data?: Json | null
          recommendation?: string | null
          sentiment_score?: number | null
          symbol?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      structural_features_cache: {
        Row: {
          asset: string
          atr: number
          created_at: string | null
          dist_to_resistance: number | null
          dist_to_support: number | null
          fib_127_dn: number | null
          fib_127_up: number | null
          fib_161_dn: number | null
          fib_161_up: number | null
          fib_38_retrace: number | null
          fib_61_retrace: number | null
          id: string
          last_swing_high: number | null
          last_swing_low: number | null
          regime_acc: number | null
          regime_adv: number | null
          regime_decl: number | null
          regime_dist: number | null
          sr_strength: number | null
          timestamp: string
          vol_regime: number | null
        }
        Insert: {
          asset: string
          atr: number
          created_at?: string | null
          dist_to_resistance?: number | null
          dist_to_support?: number | null
          fib_127_dn?: number | null
          fib_127_up?: number | null
          fib_161_dn?: number | null
          fib_161_up?: number | null
          fib_38_retrace?: number | null
          fib_61_retrace?: number | null
          id?: string
          last_swing_high?: number | null
          last_swing_low?: number | null
          regime_acc?: number | null
          regime_adv?: number | null
          regime_decl?: number | null
          regime_dist?: number | null
          sr_strength?: number | null
          timestamp: string
          vol_regime?: number | null
        }
        Update: {
          asset?: string
          atr?: number
          created_at?: string | null
          dist_to_resistance?: number | null
          dist_to_support?: number | null
          fib_127_dn?: number | null
          fib_127_up?: number | null
          fib_161_dn?: number | null
          fib_161_up?: number | null
          fib_38_retrace?: number | null
          fib_61_retrace?: number | null
          id?: string
          last_swing_high?: number | null
          last_swing_low?: number | null
          regime_acc?: number | null
          regime_adv?: number | null
          regime_decl?: number | null
          regime_dist?: number | null
          sr_strength?: number | null
          timestamp?: string
          vol_regime?: number | null
        }
        Relationships: []
      }
      symbol_map: {
        Row: {
          asset: string
          broker_id: string
          broker_symbol: string
          created_at: string
          id: string
        }
        Insert: {
          asset: string
          broker_id: string
          broker_symbol: string
          created_at?: string
          id?: string
        }
        Update: {
          asset?: string
          broker_id?: string
          broker_symbol?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "symbol_map_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      test_table: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: number
          name?: string | null
        }
        Update: {
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          executed_at: string
          id: string
          portfolio_id: string
          ppo_signal: Json | null
          price: number
          quantity: number
          risk_score: number | null
          symbol: string
          total_amount: number
          trade_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          executed_at?: string
          id?: string
          portfolio_id: string
          ppo_signal?: Json | null
          price: number
          quantity: number
          risk_score?: number | null
          symbol: string
          total_amount: number
          trade_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          executed_at?: string
          id?: string
          portfolio_id?: string
          ppo_signal?: Json | null
          price?: number
          quantity?: number
          risk_score?: number | null
          symbol?: string
          total_amount?: number
          trade_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_type: string
          asset: string
          created_at: string | null
          id: string
          message: string
          severity: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          alert_type: string
          asset: string
          created_at?: string | null
          id?: string
          message: string
          severity: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean | null
          alert_type?: string
          asset?: string
          created_at?: string | null
          id?: string
          message?: string
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_bot_learning: {
        Row: {
          confidence_level: number | null
          confluence_score: number | null
          created_at: string
          entry_price: number | null
          exit_price: number | null
          id: string
          indicators: Json | null
          market_condition: string | null
          outcome: string | null
          profit_loss: number | null
          reasoning: string | null
          risk_level: string | null
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          trade_action: string
          trade_duration_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_level?: number | null
          confluence_score?: number | null
          created_at?: string
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          indicators?: Json | null
          market_condition?: string | null
          outcome?: string | null
          profit_loss?: number | null
          reasoning?: string | null
          risk_level?: string | null
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          trade_action: string
          trade_duration_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_level?: number | null
          confluence_score?: number | null
          created_at?: string
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          indicators?: Json | null
          market_condition?: string | null
          outcome?: string | null
          profit_loss?: number | null
          reasoning?: string | null
          risk_level?: string | null
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          trade_action?: string
          trade_duration_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_metrics: {
        Row: {
          created_at: string | null
          id: string
          metrics: Json
          model_type: string
          model_weights: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metrics: Json
          model_type: string
          model_weights?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metrics?: Json
          model_type?: string
          model_weights?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trading_sessions: {
        Row: {
          created_at: string
          id: string
          started_at: string
          status: string
          stopped_at: string | null
          total_pnl: number | null
          total_trades: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          started_at?: string
          status: string
          stopped_at?: string | null
          total_pnl?: number | null
          total_trades?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          started_at?: string
          status?: string
          stopped_at?: string | null
          total_pnl?: number | null
          total_trades?: number | null
          user_id?: string
        }
        Relationships: []
      }
      training_anomalies: {
        Row: {
          anomaly_type: string
          auto_corrected: boolean
          bar_index: number
          created_at: string
          details: Json
          episode_num: number
          id: string
          model_id: string | null
        }
        Insert: {
          anomaly_type: string
          auto_corrected?: boolean
          bar_index: number
          created_at?: string
          details: Json
          episode_num: number
          id?: string
          model_id?: string | null
        }
        Update: {
          anomaly_type?: string
          auto_corrected?: boolean
          bar_index?: number
          created_at?: string
          details?: Json
          episode_num?: number
          id?: string
          model_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_anomalies_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "asset_models"
            referencedColumns: ["id"]
          },
        ]
      }
      training_episodes: {
        Row: {
          confluence_avg: number | null
          created_at: string | null
          episode_num: number
          fib_alignment_avg: number | null
          id: string
          long_trades: number | null
          long_wins: number | null
          max_drawdown: number | null
          model_id: string | null
          num_trades: number | null
          pnl: number | null
          sharpe_ratio: number | null
          short_trades: number | null
          short_wins: number | null
          total_reward: number | null
        }
        Insert: {
          confluence_avg?: number | null
          created_at?: string | null
          episode_num: number
          fib_alignment_avg?: number | null
          id?: string
          long_trades?: number | null
          long_wins?: number | null
          max_drawdown?: number | null
          model_id?: string | null
          num_trades?: number | null
          pnl?: number | null
          sharpe_ratio?: number | null
          short_trades?: number | null
          short_wins?: number | null
          total_reward?: number | null
        }
        Update: {
          confluence_avg?: number | null
          created_at?: string | null
          episode_num?: number
          fib_alignment_avg?: number | null
          id?: string
          long_trades?: number | null
          long_wins?: number | null
          max_drawdown?: number | null
          model_id?: string | null
          num_trades?: number | null
          pnl?: number | null
          sharpe_ratio?: number | null
          short_trades?: number | null
          short_wins?: number | null
          total_reward?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_episodes_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "asset_models"
            referencedColumns: ["id"]
          },
        ]
      }
      training_runs: {
        Row: {
          artifact_uri: string | null
          asset: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          metrics_json: Json | null
          started_at: string | null
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          artifact_uri?: string | null
          asset: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metrics_json?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          artifact_uri?: string | null
          asset?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metrics_json?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      user_asset_prefs: {
        Row: {
          asset: string
          broker_id: string
          created_at: string
          enabled: boolean
          id: string
          max_exposure_usd: number
          paper_trading_enabled: boolean | null
          risk_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset: string
          broker_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          max_exposure_usd?: number
          paper_trading_enabled?: boolean | null
          risk_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          broker_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          max_exposure_usd?: number
          paper_trading_enabled?: boolean | null
          risk_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_asset_prefs_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_report_preferences: {
        Row: {
          created_at: string
          daily_report_enabled: boolean
          id: string
          include_charts: boolean
          include_recommendations: boolean
          report_delivery_time: string
          updated_at: string
          user_id: string
          weekly_report_enabled: boolean
        }
        Insert: {
          created_at?: string
          daily_report_enabled?: boolean
          id?: string
          include_charts?: boolean
          include_recommendations?: boolean
          report_delivery_time?: string
          updated_at?: string
          user_id: string
          weekly_report_enabled?: boolean
        }
        Update: {
          created_at?: string
          daily_report_enabled?: boolean
          id?: string
          include_charts?: boolean
          include_recommendations?: boolean
          report_delivery_time?: string
          updated_at?: string
          user_id?: string
          weekly_report_enabled?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_trading_config: {
        Row: {
          auto_trading_enabled: boolean
          created_at: string
          cron_interval_minutes: number
          current_daily_loss_usd: number | null
          id: string
          last_reset_date: string | null
          max_daily_loss_usd: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_trading_enabled?: boolean
          created_at?: string
          cron_interval_minutes?: number
          current_daily_loss_usd?: number | null
          id?: string
          last_reset_date?: string | null
          max_daily_loss_usd?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_trading_enabled?: boolean
          created_at?: string
          cron_interval_minutes?: number
          current_daily_loss_usd?: number | null
          id?: string
          last_reset_date?: string | null
          max_daily_loss_usd?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      validation_window_details: {
        Row: {
          failure_reasons: string[] | null
          id: string
          passed: boolean
          test_end_bar: number
          test_max_drawdown: number | null
          test_pnl: number | null
          test_sharpe: number | null
          test_start_bar: number
          test_trades: number | null
          test_win_rate: number | null
          train_end_bar: number
          train_max_drawdown: number | null
          train_sharpe: number | null
          train_start_bar: number
          train_trades: number | null
          train_win_rate: number | null
          validation_id: string | null
          window_label: string
          window_number: number
        }
        Insert: {
          failure_reasons?: string[] | null
          id?: string
          passed: boolean
          test_end_bar: number
          test_max_drawdown?: number | null
          test_pnl?: number | null
          test_sharpe?: number | null
          test_start_bar: number
          test_trades?: number | null
          test_win_rate?: number | null
          train_end_bar: number
          train_max_drawdown?: number | null
          train_sharpe?: number | null
          train_start_bar: number
          train_trades?: number | null
          train_win_rate?: number | null
          validation_id?: string | null
          window_label: string
          window_number: number
        }
        Update: {
          failure_reasons?: string[] | null
          id?: string
          passed?: boolean
          test_end_bar?: number
          test_max_drawdown?: number | null
          test_pnl?: number | null
          test_sharpe?: number | null
          test_start_bar?: number
          test_trades?: number | null
          test_win_rate?: number | null
          train_end_bar?: number
          train_max_drawdown?: number | null
          train_sharpe?: number | null
          train_start_bar?: number
          train_trades?: number | null
          train_win_rate?: number | null
          validation_id?: string | null
          window_label?: string
          window_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "validation_window_details_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "model_validations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      audit_metrics: {
        Row: {
          action: string | null
          call_date: string | null
          function_name: string | null
          last_called: string | null
          total_calls: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      mv_daily_model_metrics: {
        Row: {
          asset: string | null
          avg_pnl: number | null
          daily_pnl: number | null
          model_version: string | null
          pnl_std_dev: number | null
          total_trades: number | null
          trade_date: string | null
          winning_trades: number | null
        }
        Relationships: []
      }
      mv_hourly_signal_performance: {
        Row: {
          asset: string | null
          avg_confluence: number | null
          avg_latency_sec: number | null
          blocked: number | null
          executed: number | null
          hour: string | null
          total_signals: number | null
        }
        Relationships: []
      }
      mv_user_trading_stats: {
        Row: {
          active_assets: number | null
          active_days: number | null
          avg_confluence: number | null
          last_trade_date: string | null
          total_pnl: number | null
          user_id: string | null
          win_rate: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_portfolio_correlations: {
        Args: { days_back?: number; p_user_id: string }
        Returns: Json
      }
      cleanup_old_audit_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_rate_limits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      migrate_legacy_credentials: {
        Args: Record<PropertyKey, never>
        Returns: {
          connection_id: string
          message: string
          status: string
        }[]
      }
      refresh_signal_performance_mv: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      refresh_user_stats_mv: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      trigger_online_ppo_updates: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
