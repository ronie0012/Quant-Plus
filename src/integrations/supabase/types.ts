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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          currency: string
          data_source: string
          funds_used: number
          profit: number
          profit_pct: number
          total_funds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          data_source?: string
          funds_used?: number
          profit?: number
          profit_pct?: number
          total_funds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          data_source?: string
          funds_used?: number
          profit?: number
          profit_pct?: number
          total_funds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analyses: {
        Row: {
          conviction: number
          created_at: string
          id: string
          risk: string
          summary: string | null
          symbol: string
          user_id: string
          verdict: string
        }
        Insert: {
          conviction?: number
          created_at?: string
          id?: string
          risk?: string
          summary?: string | null
          symbol: string
          user_id: string
          verdict: string
        }
        Update: {
          conviction?: number
          created_at?: string
          id?: string
          risk?: string
          summary?: string | null
          symbol?: string
          user_id?: string
          verdict?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          avg_price: number
          company: string
          created_at: string
          id: string
          last_price: number
          quantity: number
          sector: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          company: string
          created_at?: string
          id?: string
          last_price?: number
          quantity?: number
          sector?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          avg_price?: number
          company?: string
          created_at?: string
          id?: string
          last_price?: number
          quantity?: number
          sector?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      market_events: {
        Row: {
          data_source: string
          event: string
          event_time: string
          id: string
          importance: string
          region: string
        }
        Insert: {
          data_source?: string
          event: string
          event_time: string
          id?: string
          importance: string
          region: string
        }
        Update: {
          data_source?: string
          event?: string
          event_time?: string
          id?: string
          importance?: string
          region?: string
        }
        Relationships: []
      }
      market_instruments: {
        Row: {
          change_abs: number
          change_pct: number
          currency: string
          data_source: string
          kind: string
          name: string
          sort_order: number
          symbol: string
          updated_at: string
          value: number
        }
        Insert: {
          change_abs: number
          change_pct: number
          currency?: string
          data_source?: string
          kind?: string
          name: string
          sort_order?: number
          symbol: string
          updated_at?: string
          value: number
        }
        Update: {
          change_abs?: number
          change_pct?: number
          currency?: string
          data_source?: string
          kind?: string
          name?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      market_news: {
        Row: {
          category: string
          data_source: string
          headline: string
          id: string
          impact: string
          published_at: string
          sentiment: string
          source: string
        }
        Insert: {
          category: string
          data_source?: string
          headline: string
          id?: string
          impact: string
          published_at?: string
          sentiment: string
          source: string
        }
        Update: {
          category?: string
          data_source?: string
          headline?: string
          id?: string
          impact?: string
          published_at?: string
          sentiment?: string
          source?: string
        }
        Relationships: []
      }
      market_sentiment: {
        Row: {
          breakdown: Json
          data_source: string
          id: string
          label: string
          score: number
          updated_at: string
        }
        Insert: {
          breakdown?: Json
          data_source?: string
          id?: string
          label: string
          score: number
          updated_at?: string
        }
        Update: {
          breakdown?: Json
          data_source?: string
          id?: string
          label?: string
          score?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          company: string
          created_at: string
          filled_at: string | null
          id: string
          limit_price: number | null
          order_type: Database["public"]["Enums"]["order_kind"]
          price: number
          quantity: number
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          symbol: string
          user_id: string
        }
        Insert: {
          company?: string
          created_at?: string
          filled_at?: string | null
          id?: string
          limit_price?: number | null
          order_type?: Database["public"]["Enums"]["order_kind"]
          price: number
          quantity: number
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          symbol: string
          user_id?: string
        }
        Update: {
          company?: string
          created_at?: string
          filled_at?: string | null
          id?: string
          limit_price?: number | null
          order_type?: Database["public"]["Enums"]["order_kind"]
          price?: number
          quantity?: number
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_complete: boolean
          preferences: Json
          updated_at: string
          workspace_name: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_complete?: boolean
          preferences?: Json
          updated_at?: string
          workspace_name?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_complete?: boolean
          preferences?: Json
          updated_at?: string
          workspace_name?: string
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          change_pct: number
          company: string
          created_at: string
          id: string
          price: number
          symbol: string
          user_id: string
        }
        Insert: {
          change_pct?: number
          company: string
          created_at?: string
          id?: string
          price?: number
          symbol: string
          user_id: string
        }
        Update: {
          change_pct?: number
          company?: string
          created_at?: string
          id?: string
          price?: number
          symbol?: string
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
      order_kind: "MARKET" | "LIMIT" | "STOP"
      order_side: "BUY" | "SELL"
      order_status: "OPEN" | "FILLED" | "CANCELLED" | "REJECTED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      order_kind: ["MARKET", "LIMIT", "STOP"],
      order_side: ["BUY", "SELL"],
      order_status: ["OPEN", "FILLED", "CANCELLED", "REJECTED"],
    },
  },
} as const
