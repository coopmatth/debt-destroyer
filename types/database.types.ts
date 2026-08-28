// AUTO-GENERATED from supabase/migrations. Do not edit by hand.
// Regenerate against your linked project with: npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          plaid_account_id: string;
          name: string;
          official_name: string | null;
          mask: string | null;
          type: Database["public"]["Enums"]["account_type"];
          subtype: string | null;
          current_balance_cents: number | null;
          available_balance_cents: number | null;
          credit_limit_cents: number | null;
          iso_currency_code: string;
          is_liquid: boolean | null;
          balances_updated_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          plaid_account_id: string;
          name: string;
          official_name?: string | null;
          mask?: string | null;
          type: Database["public"]["Enums"]["account_type"];
          subtype?: string | null;
          current_balance_cents?: number | null;
          available_balance_cents?: number | null;
          credit_limit_cents?: number | null;
          iso_currency_code?: string;
          balances_updated_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          plaid_account_id?: string;
          name?: string;
          official_name?: string | null;
          mask?: string | null;
          type?: Database["public"]["Enums"]["account_type"];
          subtype?: string | null;
          current_balance_cents?: number | null;
          available_balance_cents?: number | null;
          credit_limit_cents?: number | null;
          iso_currency_code?: string;
          balances_updated_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
          Relationships: [
            {
              foreignKeyName: "accounts_item_id_fkey";
              columns: ["item_id"];
              isOneToOne: false;
              referencedRelation: "plaid_items";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "accounts_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
      debt_strikes: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          strategy: Database["public"]["Enums"]["debt_strategy"];
          liquid_cash_cents: number;
          fixed_expenses_cents: number;
          variable_expenses_cents: number;
          minimums_reserved_cents: number;
          buffer_floor_cents: number;
          safe_to_spend_cents: number;
          recommended_amount_cents: number;
          target_debt_id: string | null;
          status: Database["public"]["Enums"]["strike_status"];
          breakdown: Json;
          computed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          strategy: Database["public"]["Enums"]["debt_strategy"];
          liquid_cash_cents: number;
          fixed_expenses_cents: number;
          variable_expenses_cents: number;
          minimums_reserved_cents: number;
          buffer_floor_cents: number;
          safe_to_spend_cents: number;
          recommended_amount_cents: number;
          target_debt_id?: string | null;
          status?: Database["public"]["Enums"]["strike_status"];
          breakdown?: Json;
          computed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          strategy?: Database["public"]["Enums"]["debt_strategy"];
          liquid_cash_cents?: number;
          fixed_expenses_cents?: number;
          variable_expenses_cents?: number;
          minimums_reserved_cents?: number;
          buffer_floor_cents?: number;
          safe_to_spend_cents?: number;
          recommended_amount_cents?: number;
          target_debt_id?: string | null;
          status?: Database["public"]["Enums"]["strike_status"];
          breakdown?: Json;
          computed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
          Relationships: [
            {
              foreignKeyName: "debt_strikes_target_debt_id_fkey";
              columns: ["target_debt_id"];
              isOneToOne: false;
              referencedRelation: "debts";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "debt_strikes_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
      debts: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          name: string;
          kind: Database["public"]["Enums"]["debt_kind"];
          current_balance_cents: number;
          statement_balance_cents: number | null;
          credit_limit_cents: number | null;
          apr: number;
          apr_type: string;
          minimum_payment_cents: number;
          next_due_date: string | null;
          last_payment_date: string | null;
          last_payment_cents: number | null;
          is_overdue: boolean;
          is_manual: boolean | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          min_payment_paid_for_due_date: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id?: string | null;
          name: string;
          kind?: Database["public"]["Enums"]["debt_kind"];
          current_balance_cents?: number;
          statement_balance_cents?: number | null;
          credit_limit_cents?: number | null;
          apr?: number;
          apr_type?: string;
          minimum_payment_cents?: number;
          next_due_date?: string | null;
          last_payment_date?: string | null;
          last_payment_cents?: number | null;
          is_overdue?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          min_payment_paid_for_due_date?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string | null;
          name?: string;
          kind?: Database["public"]["Enums"]["debt_kind"];
          current_balance_cents?: number;
          statement_balance_cents?: number | null;
          credit_limit_cents?: number | null;
          apr?: number;
          apr_type?: string;
          minimum_payment_cents?: number;
          next_due_date?: string | null;
          last_payment_date?: string | null;
          last_payment_cents?: number | null;
          is_overdue?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          min_payment_paid_for_due_date?: string | null;
        };
          Relationships: [
            {
              foreignKeyName: "debts_account_id_fkey";
              columns: ["account_id"];
              isOneToOne: true;
              referencedRelation: "accounts";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "debts_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          name: string;
          category: string;
          amount_cents: number;
          frequency: Database["public"]["Enums"]["expense_frequency"];
          next_due_date: string;
          source: Database["public"]["Enums"]["expense_source"];
          plaid_stream_id: string | null;
          is_essential: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id?: string | null;
          name: string;
          category: string;
          amount_cents: number;
          frequency: Database["public"]["Enums"]["expense_frequency"];
          next_due_date: string;
          source?: Database["public"]["Enums"]["expense_source"];
          plaid_stream_id?: string | null;
          is_essential?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string | null;
          name?: string;
          category?: string;
          amount_cents?: number;
          frequency?: Database["public"]["Enums"]["expense_frequency"];
          next_due_date?: string;
          source?: Database["public"]["Enums"]["expense_source"];
          plaid_stream_id?: string | null;
          is_essential?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
          Relationships: [
            {
              foreignKeyName: "expenses_account_id_fkey";
              columns: ["account_id"];
              isOneToOne: false;
              referencedRelation: "accounts";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "expenses_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
      plaid_items: {
        Row: {
          id: string;
          user_id: string;
          plaid_item_id: string;
          access_token_encrypted: string;
          key_version: number;
          institution_id: string | null;
          institution_name: string | null;
          available_products: string[];
          billed_products: string[];
          transactions_cursor: string | null;
          status: Database["public"]["Enums"]["item_status"];
          error_code: string | null;
          consent_expires_at: string | null;
          last_transactions_sync_at: string | null;
          last_liabilities_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plaid_item_id: string;
          access_token_encrypted: string;
          key_version?: number;
          institution_id?: string | null;
          institution_name?: string | null;
          available_products?: string[];
          billed_products?: string[];
          transactions_cursor?: string | null;
          status?: Database["public"]["Enums"]["item_status"];
          error_code?: string | null;
          consent_expires_at?: string | null;
          last_transactions_sync_at?: string | null;
          last_liabilities_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plaid_item_id?: string;
          access_token_encrypted?: string;
          key_version?: number;
          institution_id?: string | null;
          institution_name?: string | null;
          available_products?: string[];
          billed_products?: string[];
          transactions_cursor?: string | null;
          status?: Database["public"]["Enums"]["item_status"];
          error_code?: string | null;
          consent_expires_at?: string | null;
          last_transactions_sync_at?: string | null;
          last_liabilities_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
          Relationships: [
            {
              foreignKeyName: "plaid_items_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
      plaid_webhook_events: {
        Row: {
          id: string;
          plaid_item_id: string | null;
          webhook_type: string;
          webhook_code: string;
          dedupe_key: string;
          payload: Json;
          received_at: string;
          processed_at: string | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          plaid_item_id?: string | null;
          webhook_type: string;
          webhook_code: string;
          dedupe_key: string;
          payload: Json;
          received_at?: string;
          processed_at?: string | null;
          error?: string | null;
        };
        Update: {
          id?: string;
          plaid_item_id?: string | null;
          webhook_type?: string;
          webhook_code?: string;
          dedupe_key?: string;
          payload?: Json;
          received_at?: string;
          processed_at?: string | null;
          error?: string | null;
        };
          Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          plaid_transaction_id: string;
          pending_transaction_id: string | null;
          amount_cents: number;
          iso_currency_code: string;
          date: string;
          authorized_date: string | null;
          name: string | null;
          merchant_name: string | null;
          pfc_primary: string | null;
          pfc_detailed: string | null;
          is_pending: boolean;
          is_transfer: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          plaid_transaction_id: string;
          pending_transaction_id?: string | null;
          amount_cents: number;
          iso_currency_code?: string;
          date: string;
          authorized_date?: string | null;
          name?: string | null;
          merchant_name?: string | null;
          pfc_primary?: string | null;
          pfc_detailed?: string | null;
          is_pending?: boolean;
          is_transfer?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string;
          plaid_transaction_id?: string;
          pending_transaction_id?: string | null;
          amount_cents?: number;
          iso_currency_code?: string;
          date?: string;
          authorized_date?: string | null;
          name?: string | null;
          merchant_name?: string | null;
          pfc_primary?: string | null;
          pfc_detailed?: string | null;
          is_pending?: boolean;
          is_transfer?: boolean;
          created_at?: string;
          updated_at?: string;
        };
          Relationships: [
            {
              foreignKeyName: "transactions_account_id_fkey";
              columns: ["account_id"];
              isOneToOne: false;
              referencedRelation: "accounts";
              referencedColumns: ["id"];
            },
            {
              foreignKeyName: "transactions_user_id_fkey";
              columns: ["user_id"];
              isOneToOne: false;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          preferred_strategy: Database["public"]["Enums"]["debt_strategy"];
          weekly_variable_budget_cents: number;
          min_cash_buffer_cents: number;
          pay_frequency: Database["public"]["Enums"]["pay_frequency"];
          next_payday: string | null;
          timezone: string;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          preferred_strategy?: Database["public"]["Enums"]["debt_strategy"];
          weekly_variable_budget_cents?: number;
          min_cash_buffer_cents?: number;
          pay_frequency?: Database["public"]["Enums"]["pay_frequency"];
          next_payday?: string | null;
          timezone?: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          preferred_strategy?: Database["public"]["Enums"]["debt_strategy"];
          weekly_variable_budget_cents?: number;
          min_cash_buffer_cents?: number;
          pay_frequency?: Database["public"]["Enums"]["pay_frequency"];
          next_payday?: string | null;
          timezone?: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
          Relationships: [
            {
              foreignKeyName: "users_id_fkey";
              columns: ["id"];
              isOneToOne: true;
              referencedRelation: "users";
              referencedColumns: ["id"];
            },
          ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      account_type: 'depository' | 'credit' | 'loan' | 'investment' | 'other';
      debt_kind: 'credit_card' | 'student_loan' | 'mortgage' | 'auto_loan' | 'personal_loan' | 'other';
      debt_strategy: 'avalanche' | 'snowball';
      expense_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual' | 'one_time';
      expense_source: 'manual' | 'plaid_recurring' | 'derived';
      item_status: 'good' | 'login_required' | 'pending_expiration' | 'error' | 'revoked';
      pay_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
      strike_status: 'recommended' | 'accepted' | 'skipped' | 'paid' | 'superseded';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
