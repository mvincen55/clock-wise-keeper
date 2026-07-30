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
      _backup_audit_events_20260707: {
        Row: {
          action_type: string | null
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string | null
          employee_id: string | null
          event_details: Json | null
          event_type: string | null
          id: string | null
          org_id: string | null
          reason: string | null
          related_date: string | null
          related_entry_id: string | null
          target_id: string | null
          target_table: string | null
          user_id: string | null
        }
        Insert: {
          action_type?: string | null
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string | null
          employee_id?: string | null
          event_details?: Json | null
          event_type?: string | null
          id?: string | null
          org_id?: string | null
          reason?: string | null
          related_date?: string | null
          related_entry_id?: string | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string | null
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string | null
          employee_id?: string | null
          event_details?: Json | null
          event_type?: string | null
          id?: string | null
          org_id?: string | null
          reason?: string | null
          related_date?: string | null
          related_entry_id?: string | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_punches_20260707: {
        Row: {
          created_at: string | null
          created_by: string | null
          edited_at: string | null
          edited_by: string | null
          employee_id: string | null
          id: string | null
          is_edited: boolean | null
          location_lat: number | null
          location_lng: number | null
          low_confidence: boolean | null
          org_id: string | null
          original_punch_time: string | null
          punch_time: string | null
          punch_type: Database["public"]["Enums"]["punch_type"] | null
          raw_text: string | null
          seq: number | null
          source: Database["public"]["Enums"]["source_type"] | null
          time_entry_id: string | null
          time_verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_id?: string | null
          id?: string | null
          is_edited?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          low_confidence?: boolean | null
          org_id?: string | null
          original_punch_time?: string | null
          punch_time?: string | null
          punch_type?: Database["public"]["Enums"]["punch_type"] | null
          raw_text?: string | null
          seq?: number | null
          source?: Database["public"]["Enums"]["source_type"] | null
          time_entry_id?: string | null
          time_verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_id?: string | null
          id?: string | null
          is_edited?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          low_confidence?: boolean | null
          org_id?: string | null
          original_punch_time?: string | null
          punch_time?: string | null
          punch_type?: Database["public"]["Enums"]["punch_type"] | null
          raw_text?: string | null
          seq?: number | null
          source?: Database["public"]["Enums"]["source_type"] | null
          time_entry_id?: string | null
          time_verified?: boolean | null
        }
        Relationships: []
      }
      _backup_time_entries_20260707: {
        Row: {
          created_at: string | null
          created_by: string | null
          employee_code: string | null
          employee_id: string | null
          employee_name: string | null
          entry_comment: string | null
          entry_date: string | null
          id: string | null
          is_remote: boolean | null
          notes: string | null
          org_id: string | null
          raw_text: string | null
          raw_total_hhmm: string | null
          source: Database["public"]["Enums"]["source_type"] | null
          total_minutes: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          employee_code?: string | null
          employee_id?: string | null
          employee_name?: string | null
          entry_comment?: string | null
          entry_date?: string | null
          id?: string | null
          is_remote?: boolean | null
          notes?: string | null
          org_id?: string | null
          raw_text?: string | null
          raw_total_hhmm?: string | null
          source?: Database["public"]["Enums"]["source_type"] | null
          total_minutes?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          employee_code?: string | null
          employee_id?: string | null
          employee_name?: string | null
          entry_comment?: string | null
          entry_date?: string | null
          id?: string | null
          is_remote?: boolean | null
          notes?: string | null
          org_id?: string | null
          raw_text?: string | null
          raw_total_hhmm?: string | null
          source?: Database["public"]["Enums"]["source_type"] | null
          total_minutes?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      allowed_users: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      assistant_audit_findings: {
        Row: {
          created_at: string
          detail: string
          fingerprint: string
          id: string
          kind: string
          memory_id: string | null
          org_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          suggested_action: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string
          fingerprint: string
          id?: string
          kind: string
          memory_id?: string | null
          org_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_action?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string
          fingerprint?: string
          id?: string
          kind?: string
          memory_id?: string | null
          org_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_action?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_audit_findings_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "assistant_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_audit_findings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_memories: {
        Row: {
          conflict_note: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          org_id: string
          status: string
          supersedes_id: string | null
          updated_at: string
        }
        Insert: {
          conflict_note?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind: string
          org_id: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
        }
        Update: {
          conflict_note?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          org_id?: string
          status?: string
          supersedes_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_memories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_memories_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "assistant_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_day_status: {
        Row: {
          computed_at: string
          employee_id: string
          entry_date: string
          has_day_comment: boolean
          has_day_off: boolean
          has_edits: boolean
          has_modification: boolean
          has_punches: boolean
          id: string
          is_absent: boolean
          is_incomplete: boolean
          is_late: boolean
          is_remote: boolean
          is_scheduled_day: boolean
          last_modified_at: string | null
          last_modified_by: string | null
          minutes_late: number | null
          modification_source:
            | Database["public"]["Enums"]["modification_source"]
            | null
          office_closed: boolean
          org_id: string
          recompute_version: number
          schedule_expected_end: string | null
          schedule_expected_start: string | null
          status_code: string
          status_reasons: Json
          tardy_approval_status: string | null
          timezone_suspect: boolean
          user_id: string
        }
        Insert: {
          computed_at?: string
          employee_id: string
          entry_date: string
          has_day_comment?: boolean
          has_day_off?: boolean
          has_edits?: boolean
          has_modification?: boolean
          has_punches?: boolean
          id?: string
          is_absent?: boolean
          is_incomplete?: boolean
          is_late?: boolean
          is_remote?: boolean
          is_scheduled_day?: boolean
          last_modified_at?: string | null
          last_modified_by?: string | null
          minutes_late?: number | null
          modification_source?:
            | Database["public"]["Enums"]["modification_source"]
            | null
          office_closed?: boolean
          org_id: string
          recompute_version?: number
          schedule_expected_end?: string | null
          schedule_expected_start?: string | null
          status_code?: string
          status_reasons?: Json
          tardy_approval_status?: string | null
          timezone_suspect?: boolean
          user_id: string
        }
        Update: {
          computed_at?: string
          employee_id?: string
          entry_date?: string
          has_day_comment?: boolean
          has_day_off?: boolean
          has_edits?: boolean
          has_modification?: boolean
          has_punches?: boolean
          id?: string
          is_absent?: boolean
          is_incomplete?: boolean
          is_late?: boolean
          is_remote?: boolean
          is_scheduled_day?: boolean
          last_modified_at?: string | null
          last_modified_by?: string | null
          minutes_late?: number | null
          modification_source?:
            | Database["public"]["Enums"]["modification_source"]
            | null
          office_closed?: boolean
          org_id?: string
          recompute_version?: number
          schedule_expected_end?: string | null
          schedule_expected_start?: string | null
          status_code?: string
          status_reasons?: Json
          tardy_approval_status?: string | null
          timezone_suspect?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_day_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_day_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_exceptions: {
        Row: {
          created_at: string
          employee_id: string
          exception_date: string
          id: string
          org_id: string
          reason_text: string | null
          resolution_action: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["exception_status"]
          type: Database["public"]["Enums"]["exception_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          exception_date: string
          id?: string
          org_id: string
          reason_text?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["exception_status"]
          type?: Database["public"]["Enums"]["exception_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          exception_date?: string
          id?: string
          org_id?: string
          reason_text?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["exception_status"]
          type?: Database["public"]["Enums"]["exception_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_exceptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_exceptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sweep_log: {
        Row: {
          employees_failed: number
          employees_processed: number
          error_details: Json | null
          finished_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          employees_failed?: number
          employees_processed?: number
          error_details?: Json | null
          finished_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          employees_failed?: number
          employees_processed?: number
          error_details?: Json | null
          finished_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action_type: string | null
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          employee_id: string | null
          event_details: Json | null
          event_type: string
          id: string
          org_id: string
          reason: string | null
          related_date: string | null
          related_entry_id: string | null
          target_id: string | null
          target_table: string | null
          user_id: string
        }
        Insert: {
          action_type?: string | null
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          employee_id?: string | null
          event_details?: Json | null
          event_type: string
          id?: string
          org_id: string
          reason?: string | null
          related_date?: string | null
          related_entry_id?: string | null
          target_id?: string | null
          target_table?: string | null
          user_id: string
        }
        Update: {
          action_type?: string | null
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          employee_id?: string | null
          event_details?: Json | null
          event_type?: string
          id?: string
          org_id?: string
          reason?: string | null
          related_date?: string | null
          related_entry_id?: string | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          org_id: string
          payload: Json
          request_type: Database["public"]["Enums"]["change_request_type"]
          requested_by: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["change_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          payload?: Json
          request_type: Database["public"]["Enums"]["change_request_type"]
          requested_by: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          payload?: Json
          request_type?: Database["public"]["Enums"]["change_request_type"]
          requested_by?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_bypasses: {
        Row: {
          bypassed_at: string
          checklist_date: string
          created_at: string
          employee_id: string
          escalation_level: number
          id: string
          incomplete_count: number
          org_id: string
          reason: string | null
          reason_submitted_at: string | null
          resolved: boolean
          resolved_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bypassed_at?: string
          checklist_date: string
          created_at?: string
          employee_id: string
          escalation_level?: number
          id?: string
          incomplete_count?: number
          org_id: string
          reason?: string | null
          reason_submitted_at?: string | null
          resolved?: boolean
          resolved_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bypassed_at?: string
          checklist_date?: string
          created_at?: string
          employee_id?: string
          escalation_level?: number
          id?: string
          incomplete_count?: number
          org_id?: string
          reason?: string | null
          reason_submitted_at?: string | null
          resolved?: boolean
          resolved_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checklist_completions: {
        Row: {
          completed_at: string
          completed_by: string
          completed_by_name: string
          id: string
          item_id: string
          org_id: string
          period_key: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          completed_by_name: string
          id?: string
          item_id: string
          org_id: string
          period_key: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          completed_by_name?: string
          id?: string
          item_id?: string
          org_id?: string
          period_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_completions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_completions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          cadence: string
          checklist_id: string
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          per_person: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          cadence: string
          checklist_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          per_person?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          checklist_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          per_person?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          audience: string
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_requests: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string
          id: string
          org_id: string
          proposed_change: Json
          reason: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["correction_request_status"]
          target_id: string
          target_table: string
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          org_id: string
          proposed_change?: Json
          reason: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["correction_request_status"]
          target_id: string
          target_table: string
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          org_id?: string
          proposed_change?: Json
          reason?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["correction_request_status"]
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      days_off: {
        Row: {
          created_at: string
          created_by: string | null
          date_end: string
          date_start: string
          employee_id: string
          hours: number | null
          id: string
          notes: string | null
          org_id: string
          request_id: string | null
          source: string | null
          type: Database["public"]["Enums"]["day_off_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_end: string
          date_start: string
          employee_id: string
          hours?: number | null
          id?: string
          notes?: string | null
          org_id: string
          request_id?: string | null
          source?: string | null
          type?: Database["public"]["Enums"]["day_off_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_end?: string
          date_start?: string
          employee_id?: string
          hours?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          request_id?: string | null
          source?: string | null
          type?: Database["public"]["Enums"]["day_off_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "days_off_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "days_off_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "days_off_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pto_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_logs: {
        Row: {
          cash_cents: number
          checks: Json
          created_at: string
          deposit_date: string
          id: string
          illumitrac_cents: number
          ins_cc_cents: number
          notes: string
          org_id: string
          outside_financing_cents: number
          prepared_by: string | null
          prepared_by_name: string
          print_snapshot: Json | null
          pt_cc_cents: number
          updated_at: string
        }
        Insert: {
          cash_cents?: number
          checks?: Json
          created_at?: string
          deposit_date: string
          id?: string
          illumitrac_cents?: number
          ins_cc_cents?: number
          notes?: string
          org_id: string
          outside_financing_cents?: number
          prepared_by?: string | null
          prepared_by_name?: string
          print_snapshot?: Json | null
          pt_cc_cents?: number
          updated_at?: string
        }
        Update: {
          cash_cents?: number
          checks?: Json
          created_at?: string
          deposit_date?: string
          id?: string
          illumitrac_cents?: number
          ins_cc_cents?: number
          notes?: string
          org_id?: string
          outside_financing_cents?: number
          prepared_by?: string | null
          prepared_by_name?: string
          print_snapshot?: Json | null
          pt_cc_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          hire_date: string | null
          id: string
          learning_style: string | null
          org_id: string
          timezone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          hire_date?: string | null
          id?: string
          learning_style?: string | null
          org_id: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          hire_date?: string | null
          id?: string
          learning_style?: string | null
          org_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_schedule_items: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          fee_cents: number
          id: string
          is_office_fee: boolean
          notes: string
          org_id: string
          schedule_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string
          fee_cents?: number
          id?: string
          is_office_fee?: boolean
          notes?: string
          org_id: string
          schedule_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          fee_cents?: number
          id?: string
          is_office_fee?: boolean
          notes?: string
          org_id?: string
          schedule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_schedule_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedule_items_schedule_org_fkey"
            columns: ["schedule_id", "org_id"]
            isOneToOne: false
            referencedRelation: "fee_schedules"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      fee_schedules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_in_network: boolean
          kind: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_in_network?: boolean
          kind?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_in_network?: boolean
          kind?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_ai_guidance: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          org_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_ai_guidance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_code_names: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          patient_name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          patient_name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          patient_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_code_names_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_code_rules: {
        Row: {
          code: string
          created_at: string
          id: string
          kind: string
          org_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          kind: string
          org_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_code_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_discount_rules: {
        Row: {
          created_at: string
          enabled: boolean
          extra_percent: number
          id: string
          org_id: string
          percent: number
          rule_key: string
          threshold_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          extra_percent?: number
          id?: string
          org_id: string
          percent?: number
          rule_key: string
          threshold_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          extra_percent?: number
          id?: string
          org_id?: string
          percent?: number
          rule_key?: string
          threshold_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_discount_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_procedure_bundles: {
        Row: {
          codes: Json
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          codes?: Json
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          codes?: Json
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_procedure_bundles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_settings: {
        Row: {
          address_line1: string
          address_line2: string
          created_at: string
          day_of_service_threshold_cents: number
          doctor_name: string
          doctor_names: Json
          downgrade_default_on: boolean
          feature_display_name: string
          id: string
          membership_plan_name: string
          min_standalone_payment_cents: number
          org_id: string
          phone: string
          practice_name: string
          print_form_title: string
          updated_at: string
          website: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          created_at?: string
          day_of_service_threshold_cents?: number
          doctor_name?: string
          doctor_names?: Json
          downgrade_default_on?: boolean
          feature_display_name?: string
          id?: string
          membership_plan_name?: string
          min_standalone_payment_cents?: number
          org_id: string
          phone?: string
          practice_name?: string
          print_form_title?: string
          updated_at?: string
          website?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          created_at?: string
          day_of_service_threshold_cents?: number
          doctor_name?: string
          doctor_names?: Json
          downgrade_default_on?: boolean
          feature_display_name?: string
          id?: string
          membership_plan_name?: string
          min_standalone_payment_cents?: number
          org_id?: string
          phone?: string
          practice_name?: string
          print_form_title?: string
          updated_at?: string
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fof_templates: {
        Row: {
          created_at: string
          created_by: string | null
          discount_label: string
          discount_percent: number
          footnote_contact: string
          footnote_insurance: string
          footnote_prepay: string
          footnote_validity: string
          footnotes: Json
          id: string
          installment_count: number
          installment_labels: Json
          is_active: boolean
          membership_discount_percent: number
          name: string
          org_id: string
          senior_discount_applies: boolean
          show_installment_option: boolean
          show_insurance_estimate: boolean
          show_prepay_option: boolean
          show_write_off: boolean
          signature_intro: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_label?: string
          discount_percent?: number
          footnote_contact?: string
          footnote_insurance?: string
          footnote_prepay?: string
          footnote_validity?: string
          footnotes?: Json
          id?: string
          installment_count?: number
          installment_labels?: Json
          is_active?: boolean
          membership_discount_percent?: number
          name: string
          org_id: string
          senior_discount_applies?: boolean
          show_installment_option?: boolean
          show_insurance_estimate?: boolean
          show_prepay_option?: boolean
          show_write_off?: boolean
          signature_intro?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_label?: string
          discount_percent?: number
          footnote_contact?: string
          footnote_insurance?: string
          footnote_prepay?: string
          footnote_validity?: string
          footnotes?: Json
          id?: string
          installment_count?: number
          installment_labels?: Json
          is_active?: boolean
          membership_discount_percent?: number
          name?: string
          org_id?: string
          senior_discount_applies?: boolean
          show_installment_option?: boolean
          show_insurance_estimate?: boolean
          show_prepay_option?: boolean
          show_write_off?: boolean
          signature_intro?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fof_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_events: {
        Row: {
          actor_id: string
          created_at: string
          goal_id: string
          id: string
          new_title: string | null
          old_title: string
          org_id: string
          reason: string
          type: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          goal_id: string
          id?: string
          new_title?: string | null
          old_title: string
          org_id: string
          reason: string
          type: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          new_title?: string | null
          old_title?: string
          org_id?: string
          reason?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_messages: {
        Row: {
          author: string
          content: string
          created_at: string
          goal_id: string
          id: string
          org_id: string
        }
        Insert: {
          author: string
          content: string
          created_at?: string
          goal_id: string
          id?: string
          org_id: string
        }
        Update: {
          author?: string
          content?: string
          created_at?: string
          goal_id?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_messages_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_tasks: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          due_date: string | null
          goal_id: string
          id: string
          org_id: string
          sort_order: number
          title: string
          training_module_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          goal_id: string
          id?: string
          org_id: string
          sort_order?: number
          title: string
          training_module_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          goal_id?: string
          id?: string
          org_id?: string
          sort_order?: number
          title?: string
          training_module_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_tasks_training_module_id_fkey"
            columns: ["training_module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_updates: {
        Row: {
          author_id: string
          auto_drafted: boolean
          content: string
          created_at: string
          goal_id: string
          id: string
          org_id: string
          status: string
        }
        Insert: {
          author_id: string
          auto_drafted?: boolean
          content: string
          created_at?: string
          goal_id: string
          id?: string
          org_id: string
          status: string
        }
        Update: {
          author_id?: string
          auto_drafted?: boolean
          content?: string
          created_at?: string
          goal_id?: string
          id?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_updates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          month: string
          org_id: string
          smart_target: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          month: string
          org_id: string
          smart_target?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          month?: string
          org_id?: string
          smart_target?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
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
      important_number_tabs: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "important_number_tabs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      important_numbers: {
        Row: {
          created_at: string
          id: string
          label: string
          notes: string
          org_id: string
          section: string
          sort_order: number
          tab: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          notes?: string
          org_id: string
          section?: string
          sort_order?: number
          tab?: string
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          notes?: string
          org_id?: string
          section?: string
          sort_order?: number
          tab?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "important_numbers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
          org_id: string
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
          org_id: string
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
          org_id?: string
          raw_text?: string | null
          report_range_end?: string | null
          report_range_start?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          body_part: string
          category: string
          countersign_role: string
          created_at: string
          days_away: number
          description: string
          device_involved: string
          employee_id: string
          employee_signature: string
          employee_signed_at: string | null
          employee_signed_by: string | null
          follow_up_notes: string
          follow_up_required: boolean
          id: string
          immediate_action: string
          incident_date: string
          incident_time: string | null
          location: string
          manager_signature: string
          manager_signed_at: string | null
          manager_signed_by: string | null
          manager_signed_role: string
          medical_treatment: string
          org_id: string
          ppe_worn: string
          reported_by: string
          reported_by_employee_id: string | null
          reported_by_name: string
          review_notes: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string
          severity: string
          status: string
          updated_at: string
          witnesses: string
          work_related: boolean
        }
        Insert: {
          body_part?: string
          category?: string
          countersign_role?: string
          created_at?: string
          days_away?: number
          description: string
          device_involved?: string
          employee_id: string
          employee_signature?: string
          employee_signed_at?: string | null
          employee_signed_by?: string | null
          follow_up_notes?: string
          follow_up_required?: boolean
          id?: string
          immediate_action?: string
          incident_date: string
          incident_time?: string | null
          location?: string
          manager_signature?: string
          manager_signed_at?: string | null
          manager_signed_by?: string | null
          manager_signed_role?: string
          medical_treatment?: string
          org_id: string
          ppe_worn?: string
          reported_by: string
          reported_by_employee_id?: string | null
          reported_by_name?: string
          review_notes?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string
          severity?: string
          status?: string
          updated_at?: string
          witnesses?: string
          work_related?: boolean
        }
        Update: {
          body_part?: string
          category?: string
          countersign_role?: string
          created_at?: string
          days_away?: number
          description?: string
          device_involved?: string
          employee_id?: string
          employee_signature?: string
          employee_signed_at?: string | null
          employee_signed_by?: string | null
          follow_up_notes?: string
          follow_up_required?: boolean
          id?: string
          immediate_action?: string
          incident_date?: string
          incident_time?: string | null
          location?: string
          manager_signature?: string
          manager_signed_at?: string | null
          manager_signed_by?: string | null
          manager_signed_role?: string
          medical_treatment?: string
          org_id?: string
          ppe_worn?: string
          reported_by?: string
          reported_by_employee_id?: string | null
          reported_by_name?: string
          review_notes?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string
          severity?: string
          status?: string
          updated_at?: string
          witnesses?: string
          work_related?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_reported_by_employee_id_fkey"
            columns: ["reported_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_plans: {
        Row: {
          annual_max_cents: number
          basic_pct: number
          created_at: string
          deductible_cents: number
          deductible_waived_preventive: boolean
          fee_schedule_id: string | null
          id: string
          is_active: boolean
          is_in_network: boolean
          major_pct: number
          name: string
          office_fees_after_max: boolean
          org_id: string
          preventive_pct: number
          sort_order: number
          updated_at: string
          writeoff_applies: boolean
        }
        Insert: {
          annual_max_cents?: number
          basic_pct?: number
          created_at?: string
          deductible_cents?: number
          deductible_waived_preventive?: boolean
          fee_schedule_id?: string | null
          id?: string
          is_active?: boolean
          is_in_network?: boolean
          major_pct?: number
          name: string
          office_fees_after_max?: boolean
          org_id: string
          preventive_pct?: number
          sort_order?: number
          updated_at?: string
          writeoff_applies?: boolean
        }
        Update: {
          annual_max_cents?: number
          basic_pct?: number
          created_at?: string
          deductible_cents?: number
          deductible_waived_preventive?: boolean
          fee_schedule_id?: string | null
          id?: string
          is_active?: boolean
          is_in_network?: boolean
          major_pct?: number
          name?: string
          office_fees_after_max?: boolean
          org_id?: string
          preventive_pct?: number
          sort_order?: number
          updated_at?: string
          writeoff_applies?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "insurance_plans_fee_schedule_org_fkey"
            columns: ["fee_schedule_id", "org_id"]
            isOneToOne: false
            referencedRelation: "fee_schedules"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "insurance_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      location_events: {
        Row: {
          accuracy: number | null
          action_taken: string | null
          confidence_flag: boolean
          created_at: string
          employee_id: string | null
          id: string
          latitude: number
          longitude: number
          org_id: string
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
          employee_id?: string | null
          id?: string
          latitude: number
          longitude: number
          org_id: string
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
          employee_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          org_id?: string
          punch_id?: string | null
          user_id?: string
          zone_id?: string | null
          zone_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
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
      notifications: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          org_id: string
          recipient_user_id: string
          related_id: string | null
          related_table: string | null
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type: string
          org_id: string
          recipient_user_id: string
          related_id?: string | null
          related_table?: string | null
          title: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          org_id?: string
          recipient_user_id?: string
          related_id?: string | null
          related_table?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      office_closures: {
        Row: {
          closure_date: string
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          is_full_day: boolean
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          closure_date: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours?: number
          id?: string
          is_full_day?: boolean
          name: string
          org_id: string
          user_id: string
        }
        Update: {
          closure_date?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours?: number
          id?: string
          is_full_day?: boolean
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_closures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_closures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      office_doc_chunks: {
        Row: {
          chunk_index: number
          content: string
          doc_id: string
          id: string
          org_id: string
          tsv: unknown
        }
        Insert: {
          chunk_index: number
          content: string
          doc_id: string
          id?: string
          org_id: string
          tsv?: unknown
        }
        Update: {
          chunk_index?: number
          content?: string
          doc_id?: string
          id?: string
          org_id?: string
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "office_doc_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "office_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_doc_chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      office_docs: {
        Row: {
          category: string
          char_count: number
          created_at: string
          file_path: string | null
          id: string
          mime_type: string | null
          org_id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          char_count?: number
          created_at?: string
          file_path?: string | null
          id?: string
          mime_type?: string | null
          org_id: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          char_count?: number
          created_at?: string
          file_path?: string | null
          id?: string
          mime_type?: string | null
          org_id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_docs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      office_events: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          event_date: string
          id: string
          notes: string | null
          org_id: string
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          event_date: string
          id?: string
          notes?: string | null
          org_id: string
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_branding: {
        Row: {
          address_line1: string
          address_line2: string
          brand_color: string
          brand_tint: string
          created_at: string
          display_name: string
          email_sender_name: string
          google_calendar_id: string
          id: string
          legal_name: string
          logo_url: string
          org_id: string
          phone: string
          updated_at: string
          website: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          brand_color?: string
          brand_tint?: string
          created_at?: string
          display_name?: string
          email_sender_name?: string
          google_calendar_id?: string
          id?: string
          legal_name?: string
          logo_url?: string
          org_id: string
          phone?: string
          updated_at?: string
          website?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          brand_color?: string
          brand_tint?: string
          created_at?: string
          display_name?: string
          email_sender_name?: string
          google_calendar_id?: string
          id?: string
          legal_name?: string
          logo_url?: string
          org_id?: string
          phone?: string
          updated_at?: string
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_branding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_deposit_settings: {
        Row: {
          account_line: string
          bank_split_cards_label: string
          bank_split_cash_label: string
          bank_total_label: string
          created_at: string
          envelope_note: string
          id: string
          office_copy_note: string
          org_id: string
          updated_at: string
        }
        Insert: {
          account_line?: string
          bank_split_cards_label?: string
          bank_split_cash_label?: string
          bank_total_label?: string
          created_at?: string
          envelope_note?: string
          id?: string
          office_copy_note?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          account_line?: string
          bank_split_cards_label?: string
          bank_split_cash_label?: string
          bank_total_label?: string
          created_at?: string
          envelope_note?: string
          id?: string
          office_copy_note?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_deposit_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_org_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_org_role"]
          status: Database["public"]["Enums"]["org_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_org_role"]
          status?: Database["public"]["Enums"]["org_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_org_role"]
          status?: Database["public"]["Enums"]["org_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_practice_settings: {
        Row: {
          collections_visibility: string
          created_at: string
          id: string
          monthly_collections_target_cents: number | null
          org_id: string
          roleplay_notes: string | null
          roleplay_persona_style: string
          roleplay_policy_tone: string
          updated_at: string
        }
        Insert: {
          collections_visibility?: string
          created_at?: string
          id?: string
          monthly_collections_target_cents?: number | null
          org_id: string
          roleplay_notes?: string | null
          roleplay_persona_style?: string
          roleplay_policy_tone?: string
          updated_at?: string
        }
        Update: {
          collections_visibility?: string
          created_at?: string
          id?: string
          monthly_collections_target_cents?: number | null
          org_id?: string
          roleplay_notes?: string | null
          roleplay_persona_style?: string
          roleplay_policy_tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_practice_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_settings: {
        Row: {
          created_at: string
          id: string
          missing_shift_buffer_minutes: number
          org_id: string
          pay_period_type: string
          timezone: string
          updated_at: string
          user_id: string
          week_start_day: number
        }
        Insert: {
          created_at?: string
          id?: string
          missing_shift_buffer_minutes?: number
          org_id: string
          pay_period_type?: string
          timezone?: string
          updated_at?: string
          user_id: string
          week_start_day?: number
        }
        Update: {
          created_at?: string
          id?: string
          missing_shift_buffer_minutes?: number
          org_id?: string
          pay_period_type?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          week_start_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_summaries: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          org_id: string
          range_end: string
          range_start: string
          raw_text: string | null
          raw_total_hhmm: string | null
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          org_id: string
          range_end: string
          range_start: string
          raw_text?: string | null
          raw_total_hhmm?: string | null
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          org_id?: string
          range_end?: string
          range_start?: string
          raw_text?: string | null
          raw_total_hhmm?: string | null
          total_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_summaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_summaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
      pto_accrual_tiers: {
        Row: {
          created_at: string
          id: string
          label: string
          max_years: number
          min_years: number
          org_id: string
          rate: number
          sort_order: number
          updated_at: string
          weekly_cap: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          max_years: number
          min_years: number
          org_id: string
          rate: number
          sort_order?: number
          updated_at?: string
          weekly_cap: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          max_years?: number
          min_years?: number
          org_id?: string
          rate?: number
          sort_order?: number
          updated_at?: string
          weekly_cap?: number
        }
        Relationships: [
          {
            foreignKeyName: "pto_accrual_tiers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_ledger_weeks: {
        Row: {
          accrual_credited: number
          calculated_accrual: number
          created_at: string
          employee_id: string
          id: string
          org_id: string
          period_end: string
          period_start: string
          pto_taken_hours: number
          running_balance: number
          tier_rate: number
          user_id: string
          weekly_cap: number
          worked_hours_capped: number
          worked_hours_raw: number
        }
        Insert: {
          accrual_credited?: number
          calculated_accrual?: number
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          period_end: string
          period_start: string
          pto_taken_hours?: number
          running_balance?: number
          tier_rate?: number
          user_id: string
          weekly_cap?: number
          worked_hours_capped?: number
          worked_hours_raw?: number
        }
        Update: {
          accrual_credited?: number
          calculated_accrual?: number
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          pto_taken_hours?: number
          running_balance?: number
          tier_rate?: number
          user_id?: string
          weekly_cap?: number
          worked_hours_capped?: number
          worked_hours_raw?: number
        }
        Relationships: [
          {
            foreignKeyName: "pto_ledger_weeks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_ledger_weeks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_requests: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string
          end_date: string
          hours_requested: number | null
          id: string
          manager_note: string | null
          note: string
          org_id: string
          pto_type: Database["public"]["Enums"]["pto_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["pto_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id: string
          end_date: string
          hours_requested?: number | null
          id?: string
          manager_note?: string | null
          note: string
          org_id: string
          pto_type?: Database["public"]["Enums"]["pto_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["pto_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string
          end_date?: string
          hours_requested?: number | null
          id?: string
          manager_note?: string | null
          note?: string
          org_id?: string
          pto_type?: Database["public"]["Enums"]["pto_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["pto_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_settings: {
        Row: {
          allow_negative: boolean
          created_at: string
          employee_id: string
          hire_date: string
          id: string
          max_balance: number
          org_id: string
          timezone: string
          updated_at: string
          user_id: string
          worked_hours_cap_weekly: number
        }
        Insert: {
          allow_negative?: boolean
          created_at?: string
          employee_id: string
          hire_date?: string
          id?: string
          max_balance?: number
          org_id: string
          timezone?: string
          updated_at?: string
          user_id: string
          worked_hours_cap_weekly?: number
        }
        Update: {
          allow_negative?: boolean
          created_at?: string
          employee_id?: string
          hire_date?: string
          id?: string
          max_balance?: number
          org_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          worked_hours_cap_weekly?: number
        }
        Relationships: [
          {
            foreignKeyName: "pto_settings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_snapshots: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          org_id: string
          snapshot_balance_hours: number
          snapshot_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          snapshot_balance_hours?: number
          snapshot_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          snapshot_balance_hours?: number
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_snapshots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_transactions: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string
          hours: number
          id: string
          org_id: string
          reason: string | null
          source: Database["public"]["Enums"]["pto_transaction_source"]
          source_id: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["pto_transaction_type"]
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id: string
          hours: number
          id?: string
          org_id: string
          reason?: string | null
          source?: Database["public"]["Enums"]["pto_transaction_source"]
          source_id?: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["pto_transaction_type"]
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string
          hours?: number
          id?: string
          org_id?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["pto_transaction_source"]
          source_id?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["pto_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "pto_transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      punches: {
        Row: {
          created_at: string
          created_by: string | null
          edited_at: string | null
          edited_by: string | null
          employee_id: string
          id: string
          is_edited: boolean
          location_lat: number | null
          location_lng: number | null
          low_confidence: boolean
          org_id: string
          original_punch_time: string | null
          punch_time: string
          punch_type: Database["public"]["Enums"]["punch_type"]
          raw_text: string | null
          seq: number
          source: Database["public"]["Enums"]["source_type"]
          time_entry_id: string
          time_verified: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_id: string
          id?: string
          is_edited?: boolean
          location_lat?: number | null
          location_lng?: number | null
          low_confidence?: boolean
          org_id: string
          original_punch_time?: string | null
          punch_time: string
          punch_type: Database["public"]["Enums"]["punch_type"]
          raw_text?: string | null
          seq?: number
          source?: Database["public"]["Enums"]["source_type"]
          time_entry_id: string
          time_verified?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_id?: string
          id?: string
          is_edited?: boolean
          location_lat?: number | null
          location_lng?: number | null
          low_confidence?: boolean
          org_id?: string
          original_punch_time?: string | null
          punch_time?: string
          punch_type?: Database["public"]["Enums"]["punch_type"]
          raw_text?: string | null
          seq?: number
          source?: Database["public"]["Enums"]["source_type"]
          time_entry_id?: string
          time_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          org_id: string
          params: Json
          report_type: string
          requested_by: string
          row_count: number | null
          status: Database["public"]["Enums"]["report_run_status"]
          storage_path: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          org_id: string
          params?: Json
          report_type: string
          requested_by: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["report_run_status"]
          storage_path?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          org_id?: string
          params?: Json
          report_type?: string
          requested_by?: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["report_run_status"]
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_assignments: {
        Row: {
          created_at: string
          effective_end: string | null
          effective_start: string
          employee_id: string
          id: string
          org_id: string
          schedule_version_id: string
        }
        Insert: {
          created_at?: string
          effective_end?: string | null
          effective_start: string
          employee_id: string
          id?: string
          org_id: string
          schedule_version_id: string
        }
        Update: {
          created_at?: string
          effective_end?: string | null
          effective_start?: string
          employee_id?: string
          id?: string
          org_id?: string
          schedule_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_assignments_schedule_version_id_fkey"
            columns: ["schedule_version_id"]
            isOneToOne: false
            referencedRelation: "schedule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_correction_log: {
        Row: {
          edited_at: string
          edited_by: string
          employee_id: string | null
          id: string
          new_values: Json
          old_values: Json
          org_id: string | null
          version_id: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          employee_id?: string | null
          id?: string
          new_values: Json
          old_values: Json
          org_id?: string | null
          version_id: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          employee_id?: string | null
          id?: string
          new_values?: Json
          old_values?: Json
          org_id?: string | null
          version_id?: string
        }
        Relationships: []
      }
      schedule_versions: {
        Row: {
          apply_to_remote: boolean
          created_at: string
          effective_end_date: string | null
          effective_start_date: string
          employee_id: string | null
          id: string
          name: string | null
          org_id: string
          timezone: string
          updated_at: string
          user_id: string
          week_start_day: number
        }
        Insert: {
          apply_to_remote?: boolean
          created_at?: string
          effective_end_date?: string | null
          effective_start_date: string
          employee_id?: string | null
          id?: string
          name?: string | null
          org_id: string
          timezone?: string
          updated_at?: string
          user_id: string
          week_start_day?: number
        }
        Update: {
          apply_to_remote?: boolean
          created_at?: string
          effective_end_date?: string | null
          effective_start_date?: string
          employee_id?: string | null
          id?: string
          name?: string | null
          org_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          week_start_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_versions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_weekdays: {
        Row: {
          enabled: boolean
          end_time: string
          grace_minutes: number
          id: string
          schedule_version_id: string
          start_time: string
          threshold_minutes: number
          weekday: number
        }
        Insert: {
          enabled?: boolean
          end_time?: string
          grace_minutes?: number
          id?: string
          schedule_version_id: string
          start_time?: string
          threshold_minutes?: number
          weekday: number
        }
        Update: {
          enabled?: boolean
          end_time?: string
          grace_minutes?: number
          id?: string
          schedule_version_id?: string
          start_time?: string
          threshold_minutes?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_weekdays_schedule_version_id_fkey"
            columns: ["schedule_version_id"]
            isOneToOne: false
            referencedRelation: "schedule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tardies: {
        Row: {
          actual_start_time: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_id: string
          entry_date: string
          expected_start_time: string
          id: string
          minutes_late: number
          org_id: string
          reason_text: string | null
          resolved: boolean
          time_entry_id: string | null
          timezone_suspect: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_start_time: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id: string
          entry_date: string
          expected_start_time: string
          id?: string
          minutes_late?: number
          org_id: string
          reason_text?: string | null
          resolved?: boolean
          time_entry_id?: string | null
          timezone_suspect?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_start_time?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          entry_date?: string
          expected_start_time?: string
          id?: string
          minutes_late?: number
          org_id?: string
          reason_text?: string | null
          resolved?: boolean
          time_entry_id?: string | null
          timezone_suspect?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tardies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tardies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
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
          created_by: string | null
          employee_code: string | null
          employee_id: string
          employee_name: string | null
          entry_comment: string | null
          entry_date: string
          id: string
          is_remote: boolean
          notes: string | null
          org_id: string
          raw_text: string | null
          raw_total_hhmm: string | null
          source: Database["public"]["Enums"]["source_type"]
          total_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_code?: string | null
          employee_id: string
          employee_name?: string | null
          entry_comment?: string | null
          entry_date: string
          id?: string
          is_remote?: boolean
          notes?: string | null
          org_id: string
          raw_text?: string | null
          raw_total_hhmm?: string | null
          source?: Database["public"]["Enums"]["source_type"]
          total_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_code?: string | null
          employee_id?: string
          employee_name?: string | null
          entry_comment?: string | null
          entry_date?: string
          id?: string
          is_remote?: boolean
          notes?: string | null
          org_id?: string
          raw_text?: string | null
          raw_total_hhmm?: string | null
          source?: Database["public"]["Enums"]["source_type"]
          total_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_assignments: {
        Row: {
          assigned_by: string
          assigned_to: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          module_id: string
          org_id: string
          status: string
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          module_id: string
          org_id: string
          status?: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          module_id?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_assignments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_attempts: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          module_id: string
          org_id: string
          passed: boolean
          score: number
          type: string
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          module_id: string
          org_id: string
          passed?: boolean
          score?: number
          type?: string
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          module_id?: string
          org_id?: string
          passed?: boolean
          score?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_attempts_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          audience_tags: string[]
          audit: Json | null
          content: Json
          created_at: string
          created_by: string
          id: string
          learning_style: string | null
          org_id: string
          origin_goal_id: string | null
          source: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_tags?: string[]
          audit?: Json | null
          content?: Json
          created_at?: string
          created_by: string
          id?: string
          learning_style?: string | null
          org_id: string
          origin_goal_id?: string | null
          source?: string
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_tags?: string[]
          audit?: Json | null
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          learning_style?: string | null
          org_id?: string
          origin_goal_id?: string | null
          source?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_modules_origin_goal_id_fkey"
            columns: ["origin_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          color: string
          content: string
          created_at: string
          id: string
          org_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          content?: string
          created_at?: string
          id?: string
          org_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
      work_style_profiles: {
        Row: {
          answers: Json
          created_at: string
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          org_id?: string
          updated_at?: string
          user_id?: string
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          radius_meters?: number
          updated_at?: string
          user_id?: string
          zone_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_zones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_audit_trail: {
        Row: {
          after_value: string | null
          before_value: string | null
          event_details: Json | null
          event_timestamp: string | null
          event_type: string | null
          reason_comment: string | null
          related_date: string | null
          related_entry_id: string | null
          user_id: string | null
        }
        Insert: {
          after_value?: never
          before_value?: never
          event_details?: Json | null
          event_timestamp?: string | null
          event_type?: string | null
          reason_comment?: never
          related_date?: string | null
          related_entry_id?: string | null
          user_id?: string | null
        }
        Update: {
          after_value?: never
          before_value?: never
          event_details?: Json | null
          event_timestamp?: string | null
          event_type?: string | null
          reason_comment?: never
          related_date?: string | null
          related_entry_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_exceptions: {
        Row: {
          entry_date: string | null
          minutes_late: number | null
          status_code: string | null
          status_reasons: Json | null
          suggested_action: string | null
          tardy_approval_status: string | null
          tardy_reason: string | null
          timezone_suspect: boolean | null
          user_id: string | null
        }
        Relationships: []
      }
      v_pto_ledger: {
        Row: {
          accrual_credited: number | null
          calculated_accrual: number | null
          cap_applied: boolean | null
          period_end: string | null
          period_start: string | null
          pto_taken_hours: number | null
          running_balance: number | null
          tier_rate: number | null
          user_id: string | null
          weekly_cap: number | null
          worked_hours_capped: number | null
          worked_hours_raw: number | null
        }
        Insert: {
          accrual_credited?: number | null
          calculated_accrual?: number | null
          cap_applied?: never
          period_end?: string | null
          period_start?: string | null
          pto_taken_hours?: number | null
          running_balance?: number | null
          tier_rate?: number | null
          user_id?: string | null
          weekly_cap?: number | null
          worked_hours_capped?: number | null
          worked_hours_raw?: number | null
        }
        Update: {
          accrual_credited?: number | null
          calculated_accrual?: number | null
          cap_applied?: never
          period_end?: string | null
          period_start?: string | null
          pto_taken_hours?: number | null
          running_balance?: number | null
          tier_rate?: number | null
          user_id?: string | null
          weekly_cap?: number | null
          worked_hours_capped?: number | null
          worked_hours_raw?: number | null
        }
        Relationships: []
      }
      v_timesheet_day: {
        Row: {
          day_off_notes: string | null
          day_off_type: Database["public"]["Enums"]["day_off_type"] | null
          edit_count: number | null
          entry_comment: string | null
          entry_date: string | null
          entry_is_remote: boolean | null
          first_in: string | null
          has_day_off: boolean | null
          has_edits: boolean | null
          is_absent: boolean | null
          is_incomplete: boolean | null
          is_late: boolean | null
          is_remote: boolean | null
          is_scheduled_day: boolean | null
          last_out: string | null
          minutes_late: number | null
          office_closed: boolean | null
          schedule_expected_end: string | null
          schedule_expected_start: string | null
          status_code: string | null
          status_reasons: Json | null
          tardy_approval_status: string | null
          timezone_suspect: boolean | null
          total_minutes: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _recompute_schedule_window: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: undefined
      }
      can_access_employee: { Args: { _employee_id: string }; Returns: boolean }
      can_manage_goal: { Args: { _goal_id: string }; Returns: boolean }
      can_view_goal: { Args: { _goal_id: string }; Returns: boolean }
      countersign_incident_report: {
        Args: { _report_id: string; _typed_name: string }
        Returns: {
          body_part: string
          category: string
          countersign_role: string
          created_at: string
          days_away: number
          description: string
          device_involved: string
          employee_id: string
          employee_signature: string
          employee_signed_at: string | null
          employee_signed_by: string | null
          follow_up_notes: string
          follow_up_required: boolean
          id: string
          immediate_action: string
          incident_date: string
          incident_time: string | null
          location: string
          manager_signature: string
          manager_signed_at: string | null
          manager_signed_by: string | null
          manager_signed_role: string
          medical_treatment: string
          org_id: string
          ppe_worn: string
          reported_by: string
          reported_by_employee_id: string | null
          reported_by_name: string
          review_notes: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string
          severity: string
          status: string
          updated_at: string
          witnesses: string
          work_related: boolean
        }
        SetofOptions: {
          from: "*"
          to: "incident_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_employee_timezone: {
        Args: { p_employee_id: string }
        Returns: string
      }
      get_local_punch_time: {
        Args: { p_punch_time: string; p_user_id: string }
        Returns: string
      }
      get_schedule_for_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          apply_to_remote: boolean
          effective_end_date: string
          effective_start_date: string
          enabled: boolean
          end_time: string
          grace_minutes: number
          start_time: string
          threshold_minutes: number
          timezone: string
          version_id: string
          version_name: string
          weekday: number
        }[]
      }
      get_user_timezone: { Args: { p_user_id: string }; Returns: string }
      incident_countersign_role: {
        Args: { _employee_id: string }
        Returns: string
      }
      is_allowed_user: { Args: never; Returns: boolean }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      owns_goal: { Args: { _goal_id: string }; Returns: boolean }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_attendance_range: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: number
      }
      search_office_doc_chunks: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          category: string
          chunk_index: number
          content: string
          doc_id: string
          rank: number
          title: string
        }[]
      }
      sign_incident_report_employee: {
        Args: { _report_id: string; _typed_name: string }
        Returns: {
          body_part: string
          category: string
          countersign_role: string
          created_at: string
          days_away: number
          description: string
          device_involved: string
          employee_id: string
          employee_signature: string
          employee_signed_at: string | null
          employee_signed_by: string | null
          follow_up_notes: string
          follow_up_required: boolean
          id: string
          immediate_action: string
          incident_date: string
          incident_time: string | null
          location: string
          manager_signature: string
          manager_signed_at: string | null
          manager_signed_by: string | null
          manager_signed_role: string
          medical_treatment: string
          org_id: string
          ppe_worn: string
          reported_by: string
          reported_by_employee_id: string | null
          reported_by_name: string
          review_notes: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string
          severity: string
          status: string
          updated_at: string
          witnesses: string
          work_related: boolean
        }
        SetofOptions: {
          from: "*"
          to: "incident_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sweep_attendance: { Args: { p_days?: number }; Returns: string }
      training_attempt_summaries: {
        Args: { _org_id: string }
        Returns: {
          completed_at: string
          id: string
          module_id: string
          org_id: string
          passed: boolean
          score: number
          type: string
          user_id: string
        }[]
      }
      user_owns_import: { Args: { _import_id: string }; Returns: boolean }
      user_owns_schedule_version: {
        Args: { _version_id: string }
        Returns: boolean
      }
      user_owns_time_entry: { Args: { _entry_id: string }; Returns: boolean }
    }
    Enums: {
      app_org_role: "owner" | "manager" | "employee"
      change_request_status: "pending" | "approved" | "denied"
      change_request_type:
        | "punch_edit"
        | "day_off"
        | "schedule_change"
        | "other"
      correction_request_status: "pending" | "approved" | "denied" | "applied"
      day_off_type:
        | "scheduled_with_notice"
        | "unscheduled"
        | "office_closed"
        | "other"
        | "medical_leave"
      employment_status: "active" | "inactive" | "terminated"
      exception_status: "open" | "resolved" | "ignored"
      exception_type: "missing_shift" | "other"
      import_status: "pending" | "previewing" | "confirmed" | "failed"
      modification_source: "employee_request" | "manager_edit" | "system"
      org_member_status: "active" | "invited" | "disabled"
      pto_request_status: "pending" | "approved" | "denied" | "cancelled"
      pto_request_type: "pto" | "sick" | "unpaid" | "other"
      pto_transaction_source: "system" | "manager" | "request"
      pto_transaction_type: "accrual" | "taken" | "adjustment"
      punch_type: "in" | "out"
      report_run_status: "pending" | "processing" | "completed" | "failed"
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
      app_org_role: ["owner", "manager", "employee"],
      change_request_status: ["pending", "approved", "denied"],
      change_request_type: [
        "punch_edit",
        "day_off",
        "schedule_change",
        "other",
      ],
      correction_request_status: ["pending", "approved", "denied", "applied"],
      day_off_type: [
        "scheduled_with_notice",
        "unscheduled",
        "office_closed",
        "other",
        "medical_leave",
      ],
      employment_status: ["active", "inactive", "terminated"],
      exception_status: ["open", "resolved", "ignored"],
      exception_type: ["missing_shift", "other"],
      import_status: ["pending", "previewing", "confirmed", "failed"],
      modification_source: ["employee_request", "manager_edit", "system"],
      org_member_status: ["active", "invited", "disabled"],
      pto_request_status: ["pending", "approved", "denied", "cancelled"],
      pto_request_type: ["pto", "sick", "unpaid", "other"],
      pto_transaction_source: ["system", "manager", "request"],
      pto_transaction_type: ["accrual", "taken", "adjustment"],
      punch_type: ["in", "out"],
      report_run_status: ["pending", "processing", "completed", "failed"],
      source_type: ["manual", "import", "auto_location", "system_adjustment"],
    },
  },
} as const
