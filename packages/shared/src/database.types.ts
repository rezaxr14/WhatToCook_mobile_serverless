export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      ai_global_daily: {
        Row: {
          cost_micro_usd: number;
          day: string;
          requests: number;
          updated_at: string;
        };
        Insert: {
          cost_micro_usd?: number;
          day: string;
          requests?: number;
          updated_at?: string;
        };
        Update: {
          cost_micro_usd?: number;
          day?: string;
          requests?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_model_prices: {
        Row: {
          active: boolean;
          created_at: string;
          effective_from: string;
          id: number;
          input_micro_usd_per_million: number;
          model: string;
          output_micro_usd_per_million: number;
          provider: string;
          source_note: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          effective_from?: string;
          id?: number;
          input_micro_usd_per_million: number;
          model: string;
          output_micro_usd_per_million: number;
          provider: string;
          source_note?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          effective_from?: string;
          id?: number;
          input_micro_usd_per_million?: number;
          model?: string;
          output_micro_usd_per_million?: number;
          provider?: string;
          source_note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_rate_windows: {
        Row: {
          hits: number;
          subject: string;
          subject_key: string;
          updated_at: string;
          window_start: string;
        };
        Insert: {
          hits?: number;
          subject: string;
          subject_key: string;
          updated_at?: string;
          window_start: string;
        };
        Update: {
          hits?: number;
          subject?: string;
          subject_key?: string;
          updated_at?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      ai_response_cache: {
        Row: {
          created_at: string;
          expires_at: string;
          feature: string;
          hit_count: number;
          key: string;
          response: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          feature: string;
          hit_count?: number;
          key: string;
          response: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          feature?: string;
          hit_count?: number;
          key?: string;
          response?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage_counters: {
        Row: {
          cost_micro_usd: number;
          feature: string;
          period_kind: string;
          period_start: string;
          requests: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cost_micro_usd?: number;
          feature: string;
          period_kind: string;
          period_start: string;
          requests?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cost_micro_usd?: number;
          feature?: string;
          period_kind?: string;
          period_start?: string;
          requests?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_counters_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_usage_events: {
        Row: {
          cache_hit: boolean;
          cost_micro_usd: number;
          created_at: string;
          error_code: string | null;
          feature: string;
          id: string;
          input_tokens: number | null;
          latency_ms: number | null;
          model: string | null;
          output_tokens: number | null;
          provider: string | null;
          request_id: string;
          reserved_micro_usd: number;
          settled_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          cache_hit?: boolean;
          cost_micro_usd?: number;
          created_at?: string;
          error_code?: string | null;
          feature: string;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model?: string | null;
          output_tokens?: number | null;
          provider?: string | null;
          request_id: string;
          reserved_micro_usd?: number;
          settled_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          cache_hit?: boolean;
          cost_micro_usd?: number;
          created_at?: string;
          error_code?: string | null;
          feature?: string;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model?: string | null;
          output_tokens?: number | null;
          provider?: string | null;
          request_id?: string;
          reserved_micro_usd?: number;
          settled_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      app_config: {
        Row: {
          ai_kill_switch: boolean;
          feature_flags: Json;
          global_daily_cap_micro_usd: number;
          id: number;
          model_routing: Json;
          updated_at: string;
        };
        Insert: {
          ai_kill_switch?: boolean;
          feature_flags?: Json;
          global_daily_cap_micro_usd?: number;
          id?: number;
          model_routing?: Json;
          updated_at?: string;
        };
        Update: {
          ai_kill_switch?: boolean;
          feature_flags?: Json;
          global_daily_cap_micro_usd?: number;
          id?: number;
          model_routing?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      grocery_items: {
        Row: {
          category: string;
          checked: boolean;
          created_at: string;
          id: string;
          ingredient_id: number | null;
          name: string;
          quantity: string;
          source_recipe_id: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category?: string;
          checked?: boolean;
          created_at?: string;
          id?: string;
          ingredient_id?: number | null;
          name: string;
          quantity?: string;
          source_recipe_id?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          checked?: boolean;
          created_at?: string;
          id?: string;
          ingredient_id?: number | null;
          name?: string;
          quantity?: string;
          source_recipe_id?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'grocery_items_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'grocery_items_source_recipe_id_fkey';
            columns: ['source_recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'grocery_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ingredients: {
        Row: {
          calories_per_100g: number | null;
          category: string;
          created_at: string;
          id: number;
          image_path: string | null;
          name_en: string | null;
          names: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          calories_per_100g?: number | null;
          category?: string;
          created_at?: string;
          id?: number;
          image_path?: string | null;
          name_en?: string | null;
          names?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          calories_per_100g?: number | null;
          category?: string;
          created_at?: string;
          id?: number;
          image_path?: string | null;
          name_en?: string | null;
          names?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pantry_items: {
        Row: {
          deleted_at: string | null;
          id: string;
          ingredient_id: number;
          quantity: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          deleted_at?: string | null;
          id?: string;
          ingredient_id: number;
          quantity?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          deleted_at?: string | null;
          id?: string;
          ingredient_id?: number;
          quantity?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pantry_items_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pantry_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          created_at: string;
          features: Json;
          id: string;
          is_active: boolean;
          max_image_bytes: number;
          monthly_budget_micro_usd: number;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          features?: Json;
          id: string;
          is_active?: boolean;
          max_image_bytes?: number;
          monthly_budget_micro_usd?: number;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          features?: Json;
          id?: string;
          is_active?: boolean;
          max_image_bytes?: number;
          monthly_budget_micro_usd?: number;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          locale: string;
          plan_id: string;
          telegram_chat_id: number | null;
          telegram_link_expires_at: string | null;
          telegram_link_token: string | null;
          telegram_username: string | null;
          updated_at: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          locale?: string;
          plan_id?: string;
          telegram_chat_id?: number | null;
          telegram_link_expires_at?: string | null;
          telegram_link_token?: string | null;
          telegram_username?: string | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          locale?: string;
          plan_id?: string;
          telegram_chat_id?: number | null;
          telegram_link_expires_at?: string | null;
          telegram_link_token?: string | null;
          telegram_username?: string | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          created_at: string;
          id: number;
          ingredient_id: number;
          optional: boolean;
          quantity: string;
          recipe_id: number;
          sort_order: number;
          unit: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          ingredient_id: number;
          optional?: boolean;
          quantity?: string;
          recipe_id: number;
          sort_order?: number;
          unit?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          ingredient_id?: number;
          optional?: boolean;
          quantity?: string;
          recipe_id?: number;
          sort_order?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          },
        ];
      };
      recipes: {
        Row: {
          catalog_key: string | null;
          cooking_time_minutes: number | null;
          created_at: string;
          deleted_at: string | null;
          description: Json;
          id: number;
          image_path: string | null;
          instructions: Json;
          macros: Json;
          owner_id: string | null;
          servings: number | null;
          source: string;
          title: Json;
          title_en: string | null;
          updated_at: string;
        };
        Insert: {
          catalog_key?: string | null;
          cooking_time_minutes?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: Json;
          id?: number;
          image_path?: string | null;
          instructions?: Json;
          macros?: Json;
          owner_id?: string | null;
          servings?: number | null;
          source?: string;
          title?: Json;
          title_en?: string | null;
          updated_at?: string;
        };
        Update: {
          catalog_key?: string | null;
          cooking_time_minutes?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: Json;
          id?: number;
          image_path?: string | null;
          instructions?: Json;
          macros?: Json;
          owner_id?: string | null;
          servings?: number | null;
          source?: string;
          title?: Json;
          title_en?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recipes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_ai_cache_hit_rate: {
        Row: {
          cache_hits: number | null;
          day: string | null;
          feature: string | null;
          hit_rate: number | null;
          model: string | null;
          provider: string | null;
          total_requests: number | null;
        };
        Relationships: [];
      };
      v_ai_spend_by_user: {
        Row: {
          cache_hits: number | null;
          cost_micro_usd: number | null;
          feature: string | null;
          last_request_at: string | null;
          model: string | null;
          plan_id: string | null;
          provider: string | null;
          requests: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      v_ai_spend_daily: {
        Row: {
          cache_hits: number | null;
          cost_micro_usd: number | null;
          day: string | null;
          failed_requests: number | null;
          feature: string | null;
          input_tokens: number | null;
          model: string | null;
          output_tokens: number | null;
          provider: string | null;
          refunded_requests: number | null;
          settled_requests: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      add_custom_pantry_ingredient: {
        Args: { p_category?: string; p_name: string };
        Returns: number;
      };
      can_cook: { Args: never; Returns: Json };
      check_ai_rate_limit: {
        Args: {
          p_ip_hash: string;
          p_ip_limit: number;
          p_now?: string;
          p_user_id: string;
          p_user_limit: number;
          p_window_seconds?: number;
        };
        Returns: Json;
      };
      delete_my_account_data: { Args: never; Returns: undefined };
      get_my_usage: { Args: never; Returns: Json };
      prune_ai_response_cache: { Args: never; Returns: number };
      python_round: { Args: { value: number }; Returns: number };
      reap_stale_ai_reservations: { Args: never; Returns: number };
      record_ai_cache_hit: { Args: { p_key: string }; Returns: number };
      refund_ai_usage: {
        Args: { p_error_code?: string; p_event_id: string };
        Returns: Json;
      };
      reserve_ai_quota: {
        Args: {
          p_feature: string;
          p_model?: string;
          p_provider?: string;
          p_request_id: string;
          p_reserved_micro_usd: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      seed_demo_data: { Args: never; Returns: number };
      settle_ai_usage: {
        Args: {
          p_cost_micro_usd: number;
          p_event_id: string;
          p_input_tokens: number;
          p_output_tokens: number;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
