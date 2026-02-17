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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          created_at: string
          event_details: Json | null
          event_type: string
          id: string
          related_date: string | null
          related_entry_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_details?: Json | null
          event_type: string
          id?: string
          related_date?: string | null
          related_entry_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_details?: Json | null
          event_type?: string
          id?: string
          related_date?: string | null
          related_entry_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      days_off: {
        Row: {
          created_at: string
          date_end: string
          date_start: string
          hours: number | null
          id: string
          notes: string | null
          type: Database["public"]["Enums"]["day_off_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_end: string
          date_start: string
          hours?: number | null
          id?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["day_off_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_end?: string
          date_start?: string
          hours?: number | null
          id?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["day_off_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          created_at: string
          employee_code: string | null
          employee_name: string | null
          entry_date: string | null
          id: string
          import_id: string
          note_lines: string[] | null
          punch_times: string[] | null
          raw_text: string | null
          status: string | null
          total_hhmm: string | null
        }
        Insert: {
          created_at?: string
          employee_code?: string | null
          employee_name?: string | null
          entry_date?: string | null
          id?: string
          import_id: string
          note_lines?: string[] | null
          punch_times?: string[] | null
          raw_text?: string | null
          status?: string | null
          total_hhmm?: string | null
        }
        Update: {
          created_at?: string
          employee_code?: string | null
          employee_name?: string | null
          entry_date?: string | null
          id?: string
          import_id?: string
          note_lines?: string[] | null
          punch_times?: string[] | null
          raw_text?: string | null
          status?: string | null
          total_hhmm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          company_name: string | null
          created_at: string
          filename: string
          id: string
          raw_text: string | null
          report_range_end: string | null
          report_range_start: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["import_status"]
          uploaded_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          filename: string
          id?: string
          raw_text?: string | null
          report_range_end?: string | null
          report_range_start?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          uploaded_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          filename?: string
          id?: string
          raw_text?: string | null
          report_range_end?: string | null
          report_range_start?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      location_events: {
        Row: {
          accuracy: number | null
          action_taken: string | null
          confidence_flag: boolean
          created_at: string
          id: string
          latitude: number
          longitude: number
          punch_id: string | null
          user_id: string
          zone_id: string | null
          zone_status: string | null
        }
        Insert: {
          accuracy?: number | null
          action_taken?: string | null
          confidence_flag?: boolean
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          punch_id?: string | null
          user_id: string
          zone_id?: string | null
          zone_status?: string | null
        }
        Update: {
          accuracy?: number | null
          action_taken?: string | null
          confidence_flag?: boolean
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          punch_id?: string | null
          user_id?: string
          zone_id?: string | null
          zone_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_events_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "work_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_summaries: {
        Row: {
          created_at: string
          id: string
          range_end: string
          range_start: string
          raw_text: string | null
          raw_total_hhmm: string | null
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          range_end: string
          range_start: string
          raw_text?: string | null
          raw_total_hhmm?: string | null
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          range_end?: string
          range_start?: string
          raw_text?: string | null
          raw_total_hhmm?: string | null
          total_minutes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      punches: {
        Row: {
          created_at: string
          id: string
          location_lat: number | null
          location_lng: number | null
          low_confidence: boolean
          punch_time: string
          punch_type: Database["public"]["Enums"]["punch_type"]
          raw_text: string | null
          seq: number
          source: Database["public"]["Enums"]["source_type"]
          time_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          low_confidence?: boolean
          punch_time: string
          punch_type: Database["public"]["Enums"]["punch_type"]
          raw_text?: string | null
          seq?: number
          source?: Database["public"]["Enums"]["source_type"]
          time_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          low_confidence?: boolean
          punch_time?: string
          punch_type?: Database["public"]["Enums"]["punch_type"]
          raw_text?: string | null
          seq?: number
          source?: Database["public"]["Enums"]["source_type"]
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "punches_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tardies: {
        Row: {
          actual_start_time: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          entry_date: string
          expected_start_time: string
          id: string
          minutes_late: number
          reason_text: string | null
          resolved: boolean
          time_entry_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_start_time: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entry_date: string
          expected_start_time: string
          id?: string
          minutes_late?: number
          reason_text?: string | null
          resolved?: boolean
          time_entry_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_start_time?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entry_date?: string
          expected_start_time?: string
          id?: string
          minutes_late?: number
          reason_text?: string | null
          resolved?: boolean
          time_entry_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tardies_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          employee_code: string | null
          employee_name: string | null
          entry_comment: string | null
          entry_date: string
          id: string
          is_remote: boolean
          notes: string | null
          raw_text: string | null
          raw_total_hhmm: string | null
          source: Database["public"]["Enums"]["source_type"]
          total_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_code?: string | null
          employee_name?: string | null
          entry_comment?: string | null
          entry_date: string
          id?: string
          is_remote?: boolean
          notes?: string | null
          raw_text?: string | null
          raw_total_hhmm?: string | null
          source?: Database["public"]["Enums"]["source_type"]
          total_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          employee_code?: string | null
          employee_name?: string | null
          entry_comment?: string | null
          entry_date?: string
          id?: string
          is_remote?: boolean
          notes?: string | null
          raw_text?: string | null
          raw_total_hhmm?: string | null
          source?: Database["public"]["Enums"]["source_type"]
          total_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      work_schedule: {
        Row: {
          apply_to_remote: boolean
          created_at: string
          enabled: boolean
          end_time: string
          grace_minutes: number
          id: string
          start_time: string
          threshold_minutes: number
          updated_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          apply_to_remote?: boolean
          created_at?: string
          enabled?: boolean
          end_time?: string
          grace_minutes?: number
          id?: string
          start_time?: string
          threshold_minutes?: number
          updated_at?: string
          user_id: string
          weekday: number
        }
        Update: {
          apply_to_remote?: boolean
          created_at?: string
          enabled?: boolean
          end_time?: string
          grace_minutes?: number
          id?: string
          start_time?: string
          threshold_minutes?: number
          updated_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: []
      }
      work_zones: {
        Row: {
          created_at: string
          enter_delay_minutes: number
          exit_delay_minutes: number
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          radius_meters: number
          updated_at: string
          user_id: string
          zone_name: string
        }
        Insert: {
          created_at?: string
          enter_delay_minutes?: number
          exit_delay_minutes?: number
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          radius_meters?: number
          updated_at?: string
          user_id: string
          zone_name: string
        }
        Update: {
          created_at?: string
          enter_delay_minutes?: number
          exit_delay_minutes?: number
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          radius_meters?: number
          updated_at?: string
          user_id?: string
          zone_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_owns_import: { Args: { _import_id: string }; Returns: boolean }
      user_owns_time_entry: { Args: { _entry_id: string }; Returns: boolean }
    }
    Enums: {
      day_off_type:
        | "scheduled_with_notice"
        | "unscheduled"
        | "office_closed"
        | "other"
      import_status: "pending" | "previewing" | "confirmed" | "failed"
      punch_type: "in" | "out"
      source_type: "manual" | "import" | "auto_location" | "system_adjustment"
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
      day_off_type: [
        "scheduled_with_notice",
        "unscheduled",
        "office_closed",
        "other",
      ],
      import_status: ["pending", "previewing", "confirmed", "failed"],
      punch_type: ["in", "out"],
      source_type: ["manual", "import", "auto_location", "system_adjustment"],
    },
  },
} as const
