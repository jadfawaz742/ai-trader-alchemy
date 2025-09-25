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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
