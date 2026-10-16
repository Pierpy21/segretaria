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
      calendar_events: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          custom_metadata: Json
          description: string
          event_date: string
          event_time: string
          id: string
          is_ai_generated: boolean
          source: Database["public"]["Enums"]["event_source"]
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          custom_metadata?: Json
          description?: string
          event_date: string
          event_time: string
          id?: string
          is_ai_generated?: boolean
          source?: Database["public"]["Enums"]["event_source"]
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          custom_metadata?: Json
          description?: string
          event_date?: string
          event_time?: string
          id?: string
          is_ai_generated?: boolean
          source?: Database["public"]["Enums"]["event_source"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          custom_metadata: Json
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_metadata?: Json
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_metadata?: Json
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          custom_metadata: Json
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          custom_metadata: Json
          id: string
          initials: string | null
          is_ai: boolean
          last_message_at: string | null
          name: string
          snippet: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          initials?: string | null
          is_ai?: boolean
          last_message_at?: string | null
          name: string
          snippet?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          initials?: string | null
          is_ai?: boolean
          last_message_at?: string | null
          name?: string
          snippet?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          company_id: string
          conversation_id: string
          created_at: string
          custom_metadata: Json
          id: string
          sender_type: Database["public"]["Enums"]["message_from"]
          sent_at: string
          updated_at: string
        }
        Insert: {
          body: string
          company_id: string
          conversation_id: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          sender_type: Database["public"]["Enums"]["message_from"]
          sent_at?: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          conversation_id?: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          sender_type?: Database["public"]["Enums"]["message_from"]
          sent_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          amount: number
          client: string
          company_id: string
          created_at: string
          custom_metadata: Json
          description: string
          id: string
          is_ai_generated: boolean
          quote_date: string
          quote_type: string
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          client: string
          company_id: string
          created_at?: string
          custom_metadata?: Json
          description?: string
          id?: string
          is_ai_generated?: boolean
          quote_date?: string
          quote_type?: string
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          client?: string
          company_id?: string
          created_at?: string
          custom_metadata?: Json
          description?: string
          id?: string
          is_ai_generated?: boolean
          quote_date?: string
          quote_type?: string
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          company_id: string
          created_at: string
          custom_metadata: Json
          id: string
          priority: Database["public"]["Enums"]["reminder_priority"]
          remind_at: string
          status: Database["public"]["Enums"]["reminder_status"]
          text: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          priority?: Database["public"]["Enums"]["reminder_priority"]
          remind_at: string
          status?: Database["public"]["Enums"]["reminder_status"]
          text: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_metadata?: Json
          id?: string
          priority?: Database["public"]["Enums"]["reminder_priority"]
          remind_at?: string
          status?: Database["public"]["Enums"]["reminder_status"]
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          column_id: Database["public"]["Enums"]["task_column"]
          company_id: string
          created_at: string
          custom_metadata: Json
          description: string
          id: string
          is_ai: boolean
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          column_id?: Database["public"]["Enums"]["task_column"]
          company_id: string
          created_at?: string
          custom_metadata?: Json
          description?: string
          id?: string
          is_ai?: boolean
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          column_id?: Database["public"]["Enums"]["task_column"]
          company_id?: string
          created_at?: string
          custom_metadata?: Json
          description?: string
          id?: string
          is_ai?: boolean
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_company_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      event_source:
      | "google_calendar"
      | "apple_calendar"
      | "manual"
      | "ai_secretary"
      message_from: "contact" | "user" | "ai_draft"
      quote_status: "pending_ai" | "quote_sent" | "approved" | "declined"
      reminder_priority: "high" | "medium" | "low"
      reminder_status: "active" | "resolved" | "archived"
      task_column: "todo" | "in_progress" | "done"
      task_priority: "high" | "medium" | "low"
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
    Enums: {
      event_source: [
        "google_calendar",
        "apple_calendar",
        "manual",
        "ai_secretary",
      ],
      message_from: ["contact", "user", "ai_draft"],
      quote_status: ["pending_ai", "quote_sent", "approved", "declined"],
      reminder_priority: ["high", "medium", "low"],
      reminder_status: ["active", "resolved", "archived"],
      task_column: ["todo", "in_progress", "done"],
      task_priority: ["high", "medium", "low"],
    },
  },
} as const

