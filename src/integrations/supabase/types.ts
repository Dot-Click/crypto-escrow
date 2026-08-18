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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      disputes: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          raised_by: string
          reason: string
          status: Database["public"]["Enums"]["dispute_status"]
          trade_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          raised_by: string
          reason: string
          status?: Database["public"]["Enums"]["dispute_status"]
          trade_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          raised_by?: string
          reason?: string
          status?: Database["public"]["Enums"]["dispute_status"]
          trade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          accepted_payment_methods: string[]
          amount: number
          created_at: string
          crypto_type: string
          fiat_currency: string
          id: string
          price: number
          seller_id: string
          side: Database["public"]["Enums"]["listing_side"]
          status: Database["public"]["Enums"]["listing_status"]
          terms: string | null
          updated_at: string
        }
        Insert: {
          accepted_payment_methods?: string[]
          amount: number
          created_at?: string
          crypto_type: string
          fiat_currency?: string
          id?: string
          price: number
          seller_id: string
          side?: Database["public"]["Enums"]["listing_side"]
          status?: Database["public"]["Enums"]["listing_status"]
          terms?: string | null
          updated_at?: string
        }
        Update: {
          accepted_payment_methods?: string[]
          amount?: number
          created_at?: string
          crypto_type?: string
          fiat_currency?: string
          id?: string
          price?: number
          seller_id?: string
          side?: Database["public"]["Enums"]["listing_side"]
          status?: Database["public"]["Enums"]["listing_status"]
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          content: string | null
          created_at: string
          id: string
          sender_id: string
          trade_id: string
        }
        Insert: {
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          sender_id: string
          trade_id: string
        }
        Update: {
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          sender_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["profile_role"]
          trades_completed: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["profile_role"]
          trades_completed?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["profile_role"]
          trades_completed?: number
          updated_at?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          crypto_type: string
          fiat_currency: string
          id: string
          listing_id: string | null
          payment_method: string | null
          price: number
          seller_id: string
          status: Database["public"]["Enums"]["trade_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          created_at?: string
          crypto_type: string
          fiat_currency?: string
          id?: string
          listing_id?: string | null
          payment_method?: string | null
          price: number
          seller_id: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string
          crypto_type?: string
          fiat_currency?: string
          id?: string
          listing_id?: string | null
          payment_method?: string | null
          price?: number
          seller_id?: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          crypto_type: string
          external_address: string | null
          external_tx_hash: string | null
          id: string
          status: Database["public"]["Enums"]["tx_status"]
          trade_id: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          crypto_type: string
          external_address?: string | null
          external_tx_hash?: string | null
          id?: string
          status?: Database["public"]["Enums"]["tx_status"]
          trade_id?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          crypto_type?: string
          external_address?: string | null
          external_tx_hash?: string | null
          id?: string
          status?: Database["public"]["Enums"]["tx_status"]
          trade_id?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          crypto_type: string
          external_deposit_address: string | null
          held_balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          crypto_type: string
          external_deposit_address?: string | null
          held_balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          crypto_type?: string
          external_deposit_address?: string | null
          held_balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trade_party: {
        Args: { _trade_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      dispute_status: "open" | "resolved"
      listing_side: "sell" | "buy"
      listing_status: "active" | "paused" | "completed"
      profile_role: "buyer" | "seller" | "both"
      trade_status:
        | "pending"
        | "escrow_funded"
        | "payment_claimed"
        | "released"
        | "disputed"
        | "cancelled"
      tx_status: "pending" | "completed" | "failed"
      tx_type:
        | "deposit"
        | "withdrawal"
        | "escrow_hold"
        | "escrow_release"
        | "escrow_refund"
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
      app_role: ["admin", "user"],
      dispute_status: ["open", "resolved"],
      listing_side: ["sell", "buy"],
      listing_status: ["active", "paused", "completed"],
      profile_role: ["buyer", "seller", "both"],
      trade_status: [
        "pending",
        "escrow_funded",
        "payment_claimed",
        "released",
        "disputed",
        "cancelled",
      ],
      tx_status: ["pending", "completed", "failed"],
      tx_type: [
        "deposit",
        "withdrawal",
        "escrow_hold",
        "escrow_release",
        "escrow_refund",
      ],
    },
  },
} as const
