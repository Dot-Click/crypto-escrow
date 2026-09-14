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
      deposit_claims: {
        Row: {
          attempt_count: number
          claimed_amount: number
          confirmations: number | null
          created_at: string
          crypto_type: string
          id: string
          last_checked_at: string | null
          master_wallet_id: string | null
          network: string
          rejection_reason: string | null
          status: string
          transaction_id: string | null
          tx_hash: string
          updated_at: string
          user_deposit_address_id: string | null
          user_id: string
          verified_amount: number | null
          wallet_id: string
        }
        Insert: {
          attempt_count?: number
          claimed_amount: number
          confirmations?: number | null
          created_at?: string
          crypto_type: string
          id?: string
          last_checked_at?: string | null
          master_wallet_id?: string | null
          network: string
          rejection_reason?: string | null
          status?: string
          transaction_id?: string | null
          tx_hash: string
          updated_at?: string
          user_deposit_address_id?: string | null
          user_id: string
          verified_amount?: number | null
          wallet_id: string
        }
        Update: {
          attempt_count?: number
          claimed_amount?: number
          confirmations?: number | null
          created_at?: string
          crypto_type?: string
          id?: string
          last_checked_at?: string | null
          master_wallet_id?: string | null
          network?: string
          rejection_reason?: string | null
          status?: string
          transaction_id?: string | null
          tx_hash?: string
          updated_at?: string
          user_deposit_address_id?: string | null
          user_id?: string
          verified_amount?: number | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_claims_master_wallet_id_fkey"
            columns: ["master_wallet_id"]
            isOneToOne: false
            referencedRelation: "master_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_claims_user_deposit_address_id_fkey"
            columns: ["user_deposit_address_id"]
            isOneToOne: false
            referencedRelation: "user_deposit_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_claims_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_sweeps: {
        Row: {
          amount: number
          created_at: string
          crypto_type: string
          error_message: string | null
          fee: number | null
          from_address: string
          id: string
          network: string
          status: string
          to_address: string
          tx_hash: string | null
          updated_at: string
          user_deposit_address_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          crypto_type: string
          error_message?: string | null
          fee?: number | null
          from_address: string
          id?: string
          network: string
          status?: string
          to_address: string
          tx_hash?: string | null
          updated_at?: string
          user_deposit_address_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          crypto_type?: string
          error_message?: string | null
          fee?: number | null
          from_address?: string
          id?: string
          network?: string
          status?: string
          to_address?: string
          tx_hash?: string | null
          updated_at?: string
          user_deposit_address_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_sweeps_user_deposit_address_id_fkey"
            columns: ["user_deposit_address_id"]
            isOneToOne: false
            referencedRelation: "user_deposit_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_verification_log: {
        Row: {
          attempt_at: string
          deposit_claim_id: string
          details: Json
          id: string
          result: string
        }
        Insert: {
          attempt_at?: string
          deposit_claim_id: string
          details?: Json
          id?: string
          result: string
        }
        Update: {
          attempt_at?: string
          deposit_claim_id?: string
          details?: Json
          id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_verification_log_deposit_claim_id_fkey"
            columns: ["deposit_claim_id"]
            isOneToOne: false
            referencedRelation: "deposit_claims"
            referencedColumns: ["id"]
          },
        ]
      }
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
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          page_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          page_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          page_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hd_wallet_state: {
        Row: {
          last_scanned_block: number | null
          last_scanned_txid: string | null
          network: string
          next_index: number
          updated_at: string
        }
        Insert: {
          last_scanned_block?: number | null
          last_scanned_txid?: string | null
          network: string
          next_index?: number
          updated_at?: string
        }
        Update: {
          last_scanned_block?: number | null
          last_scanned_txid?: string | null
          network?: string
          next_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      lightning_deposit_invoices: {
        Row: {
          amount_btc: number
          bolt11: string
          btcpay_invoice_id: string
          created_at: string
          expires_at: string
          id: string
          last_checked_at: string | null
          payment_hash: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount_btc: number
          bolt11: string
          btcpay_invoice_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_checked_at?: string | null
          payment_hash?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount_btc?: number
          bolt11?: string
          btcpay_invoice_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_checked_at?: string | null
          payment_hash?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lightning_deposit_invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lightning_deposit_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lightning_deposit_invoices_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      lightning_withdrawals: {
        Row: {
          amount_btc: number
          bolt11: string
          btcpay_payment_id: string | null
          created_at: string
          error_message: string | null
          fee_btc: number
          id: string
          status: string
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount_btc: number
          bolt11: string
          btcpay_payment_id?: string | null
          created_at?: string
          error_message?: string | null
          fee_btc?: number
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount_btc?: number
          bolt11?: string
          btcpay_payment_id?: string | null
          created_at?: string
          error_message?: string | null
          fee_btc?: number
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lightning_withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lightning_withdrawals_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      limit_orders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          filled_amount: number | null
          filled_at: string | null
          from_amount: number
          from_crypto: string
          id: string
          status: string
          target_rate: number
          to_crypto: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          filled_amount?: number | null
          filled_at?: string | null
          from_amount: number
          from_crypto: string
          id?: string
          status?: string
          target_rate: number
          to_crypto: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          filled_amount?: number | null
          filled_at?: string | null
          from_amount?: number
          from_crypto?: string
          id?: string
          status?: string
          target_rate?: number
          to_crypto?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "limit_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_payment_methods: {
        Row: {
          id: string
          listing_id: string
          method: string
          payment_method_id: string
        }
        Insert: {
          id?: string
          listing_id: string
          method: string
          payment_method_id: string
        }
        Update: {
          id?: string
          listing_id?: string
          method?: string
          payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_payment_methods_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_payment_methods_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          accepted_payment_methods: string[]
          amount: number | null
          blocked_countries: string[]
          created_at: string
          crypto_type: string
          fiat_currency: string
          fixed_price: number | null
          id: string
          margin_percent: number
          max_amount: number | null
          min_amount: number | null
          min_trades_required: number | null
          payment_window_minutes: number | null
          price: number
          seller_id: string
          side: Database["public"]["Enums"]["listing_side"]
          status: Database["public"]["Enums"]["listing_status"]
          tags: string[]
          terms: string | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          accepted_payment_methods?: string[]
          amount?: number | null
          blocked_countries?: string[]
          created_at?: string
          crypto_type: string
          fiat_currency?: string
          fixed_price?: number | null
          id?: string
          margin_percent?: number
          max_amount?: number | null
          min_amount?: number | null
          min_trades_required?: number | null
          payment_window_minutes?: number | null
          price: number
          seller_id: string
          side?: Database["public"]["Enums"]["listing_side"]
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[]
          terms?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          accepted_payment_methods?: string[]
          amount?: number | null
          blocked_countries?: string[]
          created_at?: string
          crypto_type?: string
          fiat_currency?: string
          fixed_price?: number | null
          id?: string
          margin_percent?: number
          max_amount?: number | null
          min_amount?: number | null
          min_trades_required?: number | null
          payment_window_minutes?: number | null
          price?: number
          seller_id?: string
          side?: Database["public"]["Enums"]["listing_side"]
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[]
          terms?: string | null
          updated_at?: string
          welcome_message?: string | null
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
      login_step_ups: {
        Row: {
          expires_at: string
          session_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          expires_at: string
          session_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          expires_at?: string
          session_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_step_ups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      master_wallets: {
        Row: {
          active: boolean
          address: string
          created_at: string
          crypto_type: string
          id: string
          label: string
          min_confirmations: number
          network: string
          purpose: string
          token_contract_address: string | null
          updated_at: string
          warning_message: string
        }
        Insert: {
          active?: boolean
          address: string
          created_at?: string
          crypto_type: string
          id?: string
          label: string
          min_confirmations?: number
          network: string
          purpose?: string
          token_contract_address?: string | null
          updated_at?: string
          warning_message?: string
        }
        Update: {
          active?: boolean
          address?: string
          created_at?: string
          crypto_type?: string
          id?: string
          label?: string
          min_confirmations?: number
          network?: string
          purpose?: string
          token_contract_address?: string | null
          updated_at?: string
          warning_message?: string
        }
        Relationships: []
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
      payment_methods: {
        Row: {
          created_at: string
          details: Json
          id: string
          label: string | null
          method: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          label?: string | null
          method: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          label?: string | null
          method?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          closed_at: string | null
          country: string | null
          created_at: string
          display_name: string
          email: string | null
          email_notifications: boolean
          id: string
          is_verified: boolean
          login_email_verification: boolean
          referral_code: string
          referred_by: string | null
          release_verification: string
          role: Database["public"]["Enums"]["profile_role"]
          telegram_notifications: boolean
          trades_completed: number
          updated_at: string
          withdrawal_verification: string
        }
        Insert: {
          closed_at?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          email_notifications?: boolean
          id: string
          is_verified?: boolean
          login_email_verification?: boolean
          referral_code?: string
          referred_by?: string | null
          release_verification?: string
          role?: Database["public"]["Enums"]["profile_role"]
          telegram_notifications?: boolean
          trades_completed?: number
          updated_at?: string
          withdrawal_verification?: string
        }
        Update: {
          closed_at?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          email_notifications?: boolean
          id?: string
          is_verified?: boolean
          login_email_verification?: boolean
          referral_code?: string
          referred_by?: string | null
          release_verification?: string
          role?: Database["public"]["Enums"]["profile_role"]
          telegram_notifications?: boolean
          trades_completed?: number
          updated_at?: string
          withdrawal_verification?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          chat_id: number
          linked_at: string
          user_id: string
        }
        Insert: {
          chat_id: number
          linked_at?: string
          user_id: string
        }
        Update: {
          chat_id?: number
          linked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          crypto_type: string
          expires_at: string | null
          fee_amount: number
          fee_percent: number | null
          fee_rail: string | null
          fiat_currency: string
          id: string
          listing_id: string | null
          payment_method: string | null
          payout_amount: number
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
          expires_at?: string | null
          fee_amount?: number
          fee_percent?: number | null
          fee_rail?: string | null
          fiat_currency?: string
          id?: string
          listing_id?: string | null
          payment_method?: string | null
          payout_amount: number
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
          expires_at?: string | null
          fee_amount?: number
          fee_percent?: number | null
          fee_rail?: string | null
          fiat_currency?: string
          id?: string
          listing_id?: string | null
          payment_method?: string | null
          payout_amount?: number
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
          provider_payload: Json | null
          provider_payment_id: string | null
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
          provider_payload?: Json | null
          provider_payment_id?: string | null
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
          provider_payload?: Json | null
          provider_payment_id?: string | null
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
      used_tx_hashes: {
        Row: {
          deposit_claim_id: string | null
          id: string
          network: string
          tx_hash: string
          used_at: string
        }
        Insert: {
          deposit_claim_id?: string | null
          id?: string
          network: string
          tx_hash: string
          used_at?: string
        }
        Update: {
          deposit_claim_id?: string | null
          id?: string
          network?: string
          tx_hash?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "used_tx_hashes_deposit_claim_id_fkey"
            columns: ["deposit_claim_id"]
            isOneToOne: false
            referencedRelation: "deposit_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      user_deposit_addresses: {
        Row: {
          address: string
          created_at: string
          crypto_type: string
          derivation_index: number
          id: string
          network: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          crypto_type: string
          derivation_index: number
          id?: string
          network: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          crypto_type?: string
          derivation_index?: number
          id?: string
          network?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_deposit_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      verification_codes: {
        Row: {
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          user_id: string
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string
          document_path: string
          id: string
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verification_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          document_path: string
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          document_path?: string
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          crypto_type: string
          external_deposit_address: string | null
          held_balance: number
          id: string
          swap_locked_balance: number
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
          swap_locked_balance?: number
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
          swap_locked_balance?: number
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
      withdrawals: {
        Row: {
          amount: number
          attempt_count: number
          created_at: string
          crypto_type: string
          destination_address: string
          error_message: string | null
          fee: number | null
          id: string
          last_attempt_at: string | null
          network: string
          status: string
          transaction_id: string | null
          tx_hash: string | null
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          attempt_count?: number
          created_at?: string
          crypto_type: string
          destination_address: string
          error_message?: string | null
          fee?: number | null
          id?: string
          last_attempt_at?: string | null
          network: string
          status?: string
          transaction_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          attempt_count?: number
          created_at?: string
          crypto_type?: string
          destination_address?: string
          error_message?: string | null
          fee?: number | null
          id?: string
          last_attempt_at?: string | null
          network?: string
          status?: string
          transaction_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_user_id_fkey"
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
      allocate_deposit_index: { Args: { _network: string }; Returns: number }
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
      trigger_edge_function: { Args: { _name: string }; Returns: number }
      trigger_execute_limit_orders: { Args: never; Returns: number }
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
        | "swap_out"
        | "swap_in"
      verification_status: "pending" | "approved" | "rejected"
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
        "swap_out",
        "swap_in",
      ],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
