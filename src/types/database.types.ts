export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      constraints: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          hardness: string
          id: string
          kind: string
          metadata: Json
          recurrence_rule: string | null
          source_external_id: string | null
          source_type: string | null
          starts_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          hardness: string
          id?: string
          kind: string
          metadata?: Json
          recurrence_rule?: string | null
          source_external_id?: string | null
          source_type?: string | null
          starts_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          hardness?: string
          id?: string
          kind?: string
          metadata?: Json
          recurrence_rule?: string | null
          source_external_id?: string | null
          source_type?: string | null
          starts_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_plan_items: {
        Row: {
          bucket: string
          carryover_from_item_id: string | null
          created_at: string
          current_state: string
          id: string
          plan_id: string
          planned_minutes: number | null
          position: number
          reason: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket: string
          carryover_from_item_id?: string | null
          created_at?: string
          current_state: string
          id?: string
          plan_id: string
          planned_minutes?: number | null
          position: number
          reason?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket?: string
          carryover_from_item_id?: string | null
          created_at?: string
          current_state?: string
          id?: string
          plan_id?: string
          planned_minutes?: number | null
          position?: number
          reason?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_items_carryover_owner_fk"
            columns: ["carryover_from_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plan_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_plan_items_plan_owner_fk"
            columns: ["plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_plan_items_task_owner_fk"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          brief: string | null
          capacity_breakdown: Json
          capacity_minutes: number | null
          created_at: string
          created_by: string
          id: string
          plan_date: string
          revision: number
          status: string
          user_id: string
        }
        Insert: {
          brief?: string | null
          capacity_breakdown?: Json
          capacity_minutes?: number | null
          created_at?: string
          created_by: string
          id?: string
          plan_date: string
          revision: number
          status: string
          user_id: string
        }
        Update: {
          brief?: string | null
          capacity_breakdown?: Json
          capacity_minutes?: number | null
          created_at?: string
          created_by?: string
          id?: string
          plan_date?: string
          revision?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_items: {
        Row: {
          confidence: number | null
          created_at: string
          disposition: string
          id: string
          interpreted_kind: string | null
          interpreted_payload: Json
          needs_review: boolean
          raw_input: string
          resolved_at: string | null
          source_external_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          disposition?: string
          id?: string
          interpreted_kind?: string | null
          interpreted_payload?: Json
          needs_review?: boolean
          raw_input: string
          resolved_at?: string | null
          source_external_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          disposition?: string
          id?: string
          interpreted_kind?: string | null
          interpreted_payload?: Json
          needs_review?: boolean
          raw_input?: string
          resolved_at?: string | null
          source_external_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          locale: string | null
          planning_preferences: Json
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          locale?: string | null
          planning_preferences?: Json
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          locale?: string | null
          planning_preferences?: Json
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          goal_id: string | null
          id: string
          notes: string | null
          priority_hint: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_id?: string | null
          id?: string
          notes?: string | null
          priority_hint?: string | null
          status: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_id?: string | null
          id?: string
          notes?: string | null
          priority_hint?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_goal_owner_fk"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      source_links: {
        Row: {
          created_at: string
          external_id: string | null
          external_url: string | null
          goal_id: string | null
          id: string
          inbox_item_id: string | null
          last_seen_at: string | null
          project_id: string | null
          snapshot_hash: string | null
          source_type: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          external_url?: string | null
          goal_id?: string | null
          id?: string
          inbox_item_id?: string | null
          last_seen_at?: string | null
          project_id?: string | null
          snapshot_hash?: string | null
          source_type: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          external_url?: string | null
          goal_id?: string | null
          id?: string
          inbox_item_id?: string | null
          last_seen_at?: string | null
          project_id?: string | null
          snapshot_hash?: string | null
          source_type?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_links_goal_owner_fk"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "source_links_inbox_owner_fk"
            columns: ["inbox_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "inbox_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "source_links_project_owner_fk"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "source_links_task_owner_fk"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor: string
          actual_minutes: number | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          note: string | null
          occurred_at: string
          plan_item_id: string | null
          progress_percent: number | null
          reason: string | null
          remaining_minutes: number | null
          task_id: string
          user_id: string
        }
        Insert: {
          actor: string
          actual_minutes?: number | null
          created_at?: string
          event_type: string
          id: string
          metadata?: Json
          note?: string | null
          occurred_at: string
          plan_item_id?: string | null
          progress_percent?: number | null
          reason?: string | null
          remaining_minutes?: number | null
          task_id: string
          user_id: string
        }
        Update: {
          actor?: string
          actual_minutes?: number | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          note?: string | null
          occurred_at?: string
          plan_item_id?: string | null
          progress_percent?: number | null
          reason?: string | null
          remaining_minutes?: number | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_plan_item_owner_fk"
            columns: ["plan_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plan_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "task_events_task_owner_fk"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      tasks: {
        Row: {
          checklist: Json
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          estimate_minutes: number | null
          execution_context: string
          id: string
          not_before: string | null
          priority_hint: string | null
          project_id: string | null
          recurrence_rule: string | null
          recurrence_timezone: string | null
          remaining_minutes: number | null
          status: string
          task_kind: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checklist?: Json
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          estimate_minutes?: number | null
          execution_context: string
          id?: string
          not_before?: string | null
          priority_hint?: string | null
          project_id?: string | null
          recurrence_rule?: string | null
          recurrence_timezone?: string | null
          remaining_minutes?: number | null
          status: string
          task_kind: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checklist?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          estimate_minutes?: number | null
          execution_context?: string
          id?: string
          not_before?: string | null
          priority_hint?: string | null
          project_id?: string | null
          recurrence_rule?: string | null
          recurrence_timezone?: string | null
          remaining_minutes?: number | null
          status?: string
          task_kind?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_owner_fk"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          ai_interpretation: Json | null
          applied_at: string | null
          content: string
          created_at: string
          id: string
          plan_id: string | null
          plan_item_id: string | null
          source: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          ai_interpretation?: Json | null
          applied_at?: string | null
          content: string
          created_at?: string
          id?: string
          plan_id?: string | null
          plan_item_id?: string | null
          source: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          ai_interpretation?: Json | null
          applied_at?: string | null
          content?: string
          created_at?: string
          id?: string
          plan_id?: string | null
          plan_item_id?: string | null
          source?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_plan_item_owner_fk"
            columns: ["plan_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plan_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "user_feedback_plan_owner_fk"
            columns: ["plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "user_feedback_task_owner_fk"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

