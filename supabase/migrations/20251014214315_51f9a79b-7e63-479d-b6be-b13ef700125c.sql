-- Add trading session tracking
CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'stopped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  total_trades INTEGER DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add cron configuration per user
CREATE TABLE IF NOT EXISTS user_trading_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_trading_enabled BOOLEAN NOT NULL DEFAULT false,
  cron_interval_minutes INTEGER NOT NULL DEFAULT 15,
  max_daily_loss_usd NUMERIC DEFAULT 1000,
  current_daily_loss_usd NUMERIC DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trading_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for trading_sessions
CREATE POLICY "Users can view their own trading sessions"
  ON trading_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading sessions"
  ON trading_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading sessions"
  ON trading_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS policies for user_trading_config
CREATE POLICY "Users can view their own trading config"
  ON user_trading_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading config"
  ON user_trading_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading config"
  ON user_trading_config FOR UPDATE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at
CREATE TRIGGER update_user_trading_config_updated_at
  BEFORE UPDATE ON user_trading_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();