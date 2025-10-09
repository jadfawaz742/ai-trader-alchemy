-- Create app_role enum if not exists
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_roles table FIRST (needed for RLS policies)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- NOW create the rest of the tables

-- Create brokers table
CREATE TABLE IF NOT EXISTS public.brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  supports_crypto BOOLEAN NOT NULL DEFAULT false,
  supports_stocks BOOLEAN NOT NULL DEFAULT false,
  supports_fractional BOOLEAN NOT NULL DEFAULT false,
  supports_margin BOOLEAN NOT NULL DEFAULT false,
  supports_futures BOOLEAN NOT NULL DEFAULT false,
  supports_oco BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view brokers"
  ON public.brokers FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage brokers"
  ON public.brokers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create broker_assets table
CREATE TABLE IF NOT EXISTS public.broker_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  broker_symbol TEXT NOT NULL,
  min_qty NUMERIC NOT NULL DEFAULT 0,
  step_size NUMERIC NOT NULL DEFAULT 1,
  tick_size NUMERIC NOT NULL DEFAULT 0.01,
  min_notional NUMERIC NOT NULL DEFAULT 0,
  trading_session TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(broker_id, asset)
);

ALTER TABLE public.broker_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view broker assets"
  ON public.broker_assets FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage broker assets"
  ON public.broker_assets FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create symbol_map table
CREATE TABLE IF NOT EXISTS public.symbol_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  broker_symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset, broker_id)
);

ALTER TABLE public.symbol_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view symbol map"
  ON public.symbol_map FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage symbol map"
  ON public.symbol_map FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create broker_connections table
CREATE TABLE IF NOT EXISTS public.broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('connected', 'pending', 'revoked', 'error')),
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth', 'api_key')),
  encrypted_credentials JSONB NOT NULL,
  last_checked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, broker_id)
);

ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own broker connections"
  ON public.broker_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own broker connections"
  ON public.broker_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own broker connections"
  ON public.broker_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own broker connections"
  ON public.broker_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Create models table (enhanced)
CREATE TABLE IF NOT EXISTS public.models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'shadow', 'deprecated', 'training')),
  model_type TEXT NOT NULL DEFAULT 'ppo',
  location TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset, version)
);

ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active models"
  ON public.models FOR SELECT
  USING (status = 'active' OR auth.role() = 'authenticated');

CREATE POLICY "Admins can manage models"
  ON public.models FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create training_runs table
CREATE TABLE IF NOT EXISTS public.training_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'complete', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metrics_json JSONB,
  artifact_uri TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view training runs"
  ON public.training_runs FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage training runs"
  ON public.training_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create model_metrics table
CREATE TABLE IF NOT EXISTS public.model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  version TEXT NOT NULL,
  win_rate NUMERIC,
  sharpe NUMERIC,
  max_dd NUMERIC,
  avg_rr NUMERIC,
  total_trades INTEGER DEFAULT 0,
  profitable_trades INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset, version)
);

ALTER TABLE public.model_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view model metrics"
  ON public.model_metrics FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage model metrics"
  ON public.model_metrics FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- Create episodes table (for online learning)
CREATE TABLE IF NOT EXISTS public.episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  version TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ,
  pnl NUMERIC,
  reward_sum NUMERIC,
  bucket_uri TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own episodes"
  ON public.episodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage episodes"
  ON public.episodes FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- Create user_asset_prefs table
CREATE TABLE IF NOT EXISTS public.user_asset_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  risk_mode TEXT NOT NULL DEFAULT 'medium' CHECK (risk_mode IN ('low', 'medium', 'high')),
  max_exposure_usd NUMERIC NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, broker_id, asset)
);

ALTER TABLE public.user_asset_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own asset prefs"
  ON public.user_asset_prefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own asset prefs"
  ON public.user_asset_prefs FOR ALL
  USING (auth.uid() = user_id);

-- Create signals table
CREATE TABLE IF NOT EXISTS public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  model_id UUID REFERENCES public.models(id),
  model_version TEXT,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  qty NUMERIC NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'MARKET' CHECK (order_type IN ('MARKET', 'LIMIT')),
  limit_price NUMERIC,
  tp NUMERIC,
  sl NUMERIC,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'executed', 'failed', 'cancelled')),
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  error_message TEXT
);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signals"
  ON public.signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage signals"
  ON public.signals FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- Create executions table
CREATE TABLE IF NOT EXISTS public.executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  side TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  executed_price NUMERIC,
  executed_qty NUMERIC,
  order_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('filled', 'partial', 'rejected', 'cancelled')),
  latency_ms INTEGER,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own executions"
  ON public.executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage executions"
  ON public.executions FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- Create feature_flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature flags"
  ON public.feature_flags FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Insert default feature flags
INSERT INTO public.feature_flags (key, enabled, description)
VALUES 
  ('trading_enabled_global', false, 'Global kill switch for all trading'),
  ('online_learning_enabled', false, 'Enable online PPO updates')
ON CONFLICT (key) DO NOTHING;

-- Insert sample brokers
INSERT INTO public.brokers (name, supports_crypto, supports_stocks, supports_fractional, supports_margin, supports_oco, notes)
VALUES 
  ('Binance', true, false, false, true, true, 'Crypto exchange with spot and futures'),
  ('Alpaca', false, true, true, false, false, 'Stock trading API with fractional shares'),
  ('Interactive Brokers', true, true, false, true, true, 'Full-service broker with global coverage')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_broker_assets_broker_id ON public.broker_assets(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_assets_asset ON public.broker_assets(asset);
CREATE INDEX IF NOT EXISTS idx_signals_user_id ON public.signals(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_status ON public.signals(status);
CREATE INDEX IF NOT EXISTS idx_executions_signal_id ON public.executions(signal_id);
CREATE INDEX IF NOT EXISTS idx_episodes_asset_version ON public.episodes(asset, version);
CREATE INDEX IF NOT EXISTS idx_user_asset_prefs_user_broker ON public.user_asset_prefs(user_id, broker_id);