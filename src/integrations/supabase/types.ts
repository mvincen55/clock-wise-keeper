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
      accountability_reports: {
        Row: {
          closed_at: string | null
          created_at: string
          escalated_at: string | null
          facts: Json
          id: string
          kind: string
          manager_note: string | null
          manager_signed_at: string | null
          manager_signed_name: string | null
          member_reason: string | null
          member_signed_at: string | null
          member_signed_name: string | null
          org_id: string
          period_end: string
          period_start: string
          policy_id: string | null
          review_due_at: string | null
          reviewer_user_id: string | null
          status: string
          subject_employee_id: string | null
          subject_user_id: string
          summary: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          escalated_at?: string | null
          facts?: Json
          id?: string
          kind: string
          manager_note?: string | null
          manager_signed_at?: string | null
          manager_signed_name?: string | null
          member_reason?: string | null
          member_signed_at?: string | null
          member_signed_name?: string | null
          org_id: string
          period_end: string
          period_start: string
          policy_id?: string | null
          review_due_at?: string | null
          reviewer_user_id?: string | null
          status?: string
          subject_employee_id?: string | null
          subject_user_id: string
          summary: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          escalated_at?: string | null
          facts?: Json
          id?: string
          kind?: string
          manager_note?: string | null
          manager_signed_at?: string | null
          manager_signed_name?: string | null
          member_reason?: string | null
          member_signed_at?: string | null
          member_signed_name?: string | null
          org_id?: string
          period_end?: string
          period_start?: string
          policy_id?: string | null
          review_due_at?: string | null
          reviewer_user_id?: string | null
          status?: string
          subject_employee_id?: string | null
          subject_user_id?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_reports_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "escalation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_reports_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
      attestations: {
        Row: {
          action_type: string
          attested_at: string
          created_at: string
          employee_id: string
          id: string
          org_id: string
          payload: Json
          related_id: string
          related_table: string
          session_user_id: string | null
          verified: boolean
        }
        Insert: {
          action_type: string
          attested_at?: string
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          payload?: Json
          related_id: string
          related_table: string
          session_user_id?: string | null
          verified?: boolean
        }
        Update: {
          action_type?: string
          attested_at?: string
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          payload?: Json
          related_id?: string
          related_table?: string
          session_user_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attestations_employee_id_org_id_fkey"
            columns: ["employee_id", "org_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "attestations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
      broken_appt_settings: {
        Row: {
          created_at: string
          fee_amount: number
          history_window_years: number
          id: string
          module_nav_label: string
          notice_business_hours: number
          office_closed_dates: Json
          office_phone: string
          org_id: string
          signature_name: string
          signature_title: string
          updated_at: string
          vip_prepay_floor: number
        }
        Insert: {
          created_at?: string
          fee_amount?: number
          history_window_years?: number
          id?: string
          module_nav_label?: string
          notice_business_hours?: number
          office_closed_dates?: Json
          office_phone?: string
          org_id: string
          signature_name?: string
          signature_title?: string
          updated_at?: string
          vip_prepay_floor?: number
        }
        Update: {
          created_at?: string
          fee_amount?: number
          history_window_years?: number
          id?: string
          module_nav_label?: string
          notice_business_hours?: number
          office_closed_dates?: Json
          office_phone?: string
          org_id?: string
          signature_name?: string
          signature_title?: string
          updated_at?: string
          vip_prepay_floor?: number
        }
        Relationships: [
          {
            foreignKeyName: "broken_appt_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      broken_appt_templates: {
        Row: {
          body: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          org_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          org_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broken_appt_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_proposals: {
        Row: {
          created_at: string
          due_date: string | null
          fingerprint: string
          first_step: string | null
          id: string
          item_id: string | null
          org_id: string
          resolved_at: string | null
          status: string
          surface: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          fingerprint: string
          first_step?: string | null
          id?: string
          item_id?: string | null
          org_id: string
          resolved_at?: string | null
          status?: string
          surface: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          fingerprint?: string
          first_step?: string | null
          id?: string
          item_id?: string | null
          org_id?: string
          resolved_at?: string | null
          status?: string
          surface?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_proposals_org_id_fkey"
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
          created_by: string | null
          deferral_count: number
          due_date: string | null
          first_step: string | null
          id: string
          is_active: boolean
          org_id: string
          owner_user_id: string | null
          per_person: boolean
          sort_order: number
          source: string
          source_ref: Json
          title: string
          updated_at: string
        }
        Insert: {
          cadence: string
          checklist_id: string
          created_at?: string
          created_by?: string | null
          deferral_count?: number
          due_date?: string | null
          first_step?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          owner_user_id?: string | null
          per_person?: boolean
          sort_order?: number
          source?: string
          source_ref?: Json
          title: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          checklist_id?: string
          created_at?: string
          created_by?: string | null
          deferral_count?: number
          due_date?: string | null
          first_step?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          owner_user_id?: string | null
          per_person?: boolean
          sort_order?: number
          source?: string
          source_ref?: Json
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
          owner_user_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          owner_user_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          owner_user_id?: string | null
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
      consent_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          detail: Json
          entity_id: string | null
          entity_name: string
          entity_type: string
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_name?: string
          entity_type: string
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          org_id?: string
        }
        Relationships: []
      }
      consent_bundle_items: {
        Row: {
          bundle_id: string
          condition_label: string
          form_id: string
          id: string
          org_id: string
          requirement: string
          sort_order: number
        }
        Insert: {
          bundle_id: string
          condition_label?: string
          form_id: string
          id?: string
          org_id: string
          requirement?: string
          sort_order?: number
        }
        Update: {
          bundle_id?: string
          condition_label?: string
          form_id?: string
          id?: string
          org_id?: string
          requirement?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "consent_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "consent_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_bundle_items_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "consent_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_bundles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_sample: boolean
          name: string
          org_id: string
          procedure_codes: string[]
          sort_order: number
          status: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_sample?: boolean
          name: string
          org_id: string
          procedure_codes?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_sample?: boolean
          name?: string
          org_id?: string
          procedure_codes?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      consent_form_versions: {
        Row: {
          change_notes: string
          content: Json
          form_id: string
          id: string
          org_id: string
          published_at: string
          published_by: string | null
          version: number
        }
        Insert: {
          change_notes?: string
          content: Json
          form_id: string
          id?: string
          org_id: string
          published_at?: string
          published_by?: string | null
          version: number
        }
        Update: {
          change_notes?: string
          content?: Json
          form_id?: string
          id?: string
          org_id?: string
          published_at?: string
          published_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "consent_form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "consent_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_forms: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          current_version: number
          draft_content: Json | null
          editable_by: string
          hygienist_may_complete: boolean
          id: string
          includes_cost: boolean
          is_financial: boolean
          is_sample: boolean
          name: string
          needs_review: boolean
          org_id: string
          procedure_codes: string[]
          published_content: Json | null
          requires_doctor_signature: boolean
          requires_guardian_signature: boolean
          requires_patient_signature: boolean
          requires_witness_signature: boolean
          source: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          draft_content?: Json | null
          editable_by?: string
          hygienist_may_complete?: boolean
          id?: string
          includes_cost?: boolean
          is_financial?: boolean
          is_sample?: boolean
          name: string
          needs_review?: boolean
          org_id: string
          procedure_codes?: string[]
          published_content?: Json | null
          requires_doctor_signature?: boolean
          requires_guardian_signature?: boolean
          requires_patient_signature?: boolean
          requires_witness_signature?: boolean
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          draft_content?: Json | null
          editable_by?: string
          hygienist_may_complete?: boolean
          id?: string
          includes_cost?: boolean
          is_financial?: boolean
          is_sample?: boolean
          name?: string
          needs_review?: boolean
          org_id?: string
          procedure_codes?: string[]
          published_content?: Json | null
          requires_doctor_signature?: boolean
          requires_guardian_signature?: boolean
          requires_patient_signature?: boolean
          requires_witness_signature?: boolean
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      consent_settings: {
        Row: {
          always_offer_financial: boolean
          clear_timeout_minutes: number
          financial_form_id: string | null
          org_id: string
          require_guardian_for_minors: boolean
          require_witness_default: boolean
          team_can_archive: boolean
          team_can_change_signatures: boolean
          team_can_create_bundles: boolean
          team_can_edit_templates: boolean
          team_can_override_fees: boolean
          team_can_print: boolean
          team_can_publish: boolean
          team_can_upload: boolean
          updated_at: string
          updated_by: string | null
          warn_before_clear: boolean
        }
        Insert: {
          always_offer_financial?: boolean
          clear_timeout_minutes?: number
          financial_form_id?: string | null
          org_id: string
          require_guardian_for_minors?: boolean
          require_witness_default?: boolean
          team_can_archive?: boolean
          team_can_change_signatures?: boolean
          team_can_create_bundles?: boolean
          team_can_edit_templates?: boolean
          team_can_override_fees?: boolean
          team_can_print?: boolean
          team_can_publish?: boolean
          team_can_upload?: boolean
          updated_at?: string
          updated_by?: string | null
          warn_before_clear?: boolean
        }
        Update: {
          always_offer_financial?: boolean
          clear_timeout_minutes?: number
          financial_form_id?: string | null
          org_id?: string
          require_guardian_for_minors?: boolean
          require_witness_default?: boolean
          team_can_archive?: boolean
          team_can_change_signatures?: boolean
          team_can_create_bundles?: boolean
          team_can_edit_templates?: boolean
          team_can_override_fees?: boolean
          team_can_print?: boolean
          team_can_publish?: boolean
          team_can_upload?: boolean
          updated_at?: string
          updated_by?: string | null
          warn_before_clear?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "consent_settings_financial_form_id_fkey"
            columns: ["financial_form_id"]
            isOneToOne: false
            referencedRelation: "consent_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_read_at: string | null
          org_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          org_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          audience: string | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_requests: {
        Row: {
          applied_audit_event_ids: string[] | null
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
          applied_audit_event_ids?: string[] | null
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
          applied_audit_event_ids?: string[] | null
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
      correspondence_settings: {
        Row: {
          default_closing: string
          default_signer_name: string
          default_signer_title: string
          org_id: string
          school_note_wording: string
          team_can_manage_templates: boolean
          updated_at: string
          updated_by: string | null
          work_note_wording: string
        }
        Insert: {
          default_closing?: string
          default_signer_name?: string
          default_signer_title?: string
          org_id: string
          school_note_wording?: string
          team_can_manage_templates?: boolean
          updated_at?: string
          updated_by?: string | null
          work_note_wording?: string
        }
        Update: {
          default_closing?: string
          default_signer_name?: string
          default_signer_title?: string
          org_id?: string
          school_note_wording?: string
          team_can_manage_templates?: boolean
          updated_at?: string
          updated_by?: string | null
          work_note_wording?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
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
          capture_confidence: number | null
          cash_cents: number
          checks: Json
          created_at: string
          deposit_date: string
          doctor_cancellations: number
          doctor_no_shows: number
          hygiene_cancellations: number
          hygiene_no_shows: number
          id: string
          illumitrac_cents: number
          ins_cc_cents: number
          needs_manager_review: boolean
          new_patients_scheduled_count: number | null
          new_patients_seen_count: number | null
          notes: string
          org_id: string
          outside_financing_cents: number
          prepared_by: string | null
          prepared_by_name: string
          print_snapshot: Json | null
          production_cents: number | null
          pt_cc_cents: number
          schedule_capture_status: string
          sealed_at: string | null
          sealed_by: string | null
          staffing_assessment: string | null
          staffing_factors: string[]
          staffing_note: string
          staffing_pressure: string[]
          updated_at: string
        }
        Insert: {
          capture_confidence?: number | null
          cash_cents?: number
          checks?: Json
          created_at?: string
          deposit_date: string
          doctor_cancellations?: number
          doctor_no_shows?: number
          hygiene_cancellations?: number
          hygiene_no_shows?: number
          id?: string
          illumitrac_cents?: number
          ins_cc_cents?: number
          needs_manager_review?: boolean
          new_patients_scheduled_count?: number | null
          new_patients_seen_count?: number | null
          notes?: string
          org_id: string
          outside_financing_cents?: number
          prepared_by?: string | null
          prepared_by_name?: string
          print_snapshot?: Json | null
          production_cents?: number | null
          pt_cc_cents?: number
          schedule_capture_status?: string
          sealed_at?: string | null
          sealed_by?: string | null
          staffing_assessment?: string | null
          staffing_factors?: string[]
          staffing_note?: string
          staffing_pressure?: string[]
          updated_at?: string
        }
        Update: {
          capture_confidence?: number | null
          cash_cents?: number
          checks?: Json
          created_at?: string
          deposit_date?: string
          doctor_cancellations?: number
          doctor_no_shows?: number
          hygiene_cancellations?: number
          hygiene_no_shows?: number
          id?: string
          illumitrac_cents?: number
          ins_cc_cents?: number
          needs_manager_review?: boolean
          new_patients_scheduled_count?: number | null
          new_patients_seen_count?: number | null
          notes?: string
          org_id?: string
          outside_financing_cents?: number
          prepared_by?: string | null
          prepared_by_name?: string
          print_snapshot?: Json | null
          production_cents?: number | null
          pt_cc_cents?: number
          schedule_capture_status?: string
          sealed_at?: string | null
          sealed_by?: string | null
          staffing_assessment?: string | null
          staffing_factors?: string[]
          staffing_note?: string
          staffing_pressure?: string[]
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
      doc_library_settings: {
        Row: {
          managers_can_edit: boolean
          org_id: string
          updated_at: string
        }
        Insert: {
          managers_can_edit?: boolean
          org_id: string
          updated_at?: string
        }
        Update: {
          managers_can_edit?: boolean
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_library_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_board_items: {
        Row: {
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          note: string | null
          org_id: string
          owner_user_id: string
          repeat_rule: string
          source_request_id: string | null
          title: string
          updated_at: string
          visible_to_manager: boolean
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          note?: string | null
          org_id: string
          owner_user_id: string
          repeat_rule?: string
          source_request_id?: string | null
          title: string
          updated_at?: string
          visible_to_manager?: boolean
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          note?: string | null
          org_id?: string
          owner_user_id?: string
          repeat_rule?: string
          source_request_id?: string | null
          title?: string
          updated_at?: string
          visible_to_manager?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "doctor_board_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_board_items_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "office_requests"
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
      employee_operational_roles: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          employee_id: string
          ends_on: string | null
          id: string
          is_primary: boolean
          operational_role: string
          org_id: string
          starts_on: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          employee_id: string
          ends_on?: string | null
          id?: string
          is_primary?: boolean
          operational_role: string
          org_id: string
          starts_on?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string
          ends_on?: string | null
          id?: string
          is_primary?: boolean
          operational_role?: string
          org_id?: string
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_operational_roles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_operational_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          created_at: string
          employee_id: string
          granted_by: string | null
          id: string
          org_id: string
          permission: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          granted_by?: string | null
          id?: string
          org_id: string
          permission: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          granted_by?: string | null
          id?: string
          org_id?: string
          permission?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pins: {
        Row: {
          created_at: string
          employee_id: string
          failed_attempts: number
          locked_until: string | null
          org_id: string
          set_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          failed_attempts?: number
          locked_until?: string | null
          org_id: string
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          failed_attempts?: number
          locked_until?: string | null
          org_id?: string
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pins_employee_id_org_id_fkey"
            columns: ["employee_id", "org_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "employee_pins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_tags: {
        Row: {
          created_at: string
          display_name: string | null
          employee_id: string | null
          id: string
          org_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          employee_id?: string | null
          id?: string
          org_id: string
          tag: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          employee_id?: string | null
          id?: string
          org_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          favorites: Json
          hire_date: string | null
          id: string
          learning_style: string | null
          org_id: string
          preferred_name: string | null
          tag: string | null
          team: string | null
          timezone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          favorites?: Json
          hire_date?: string | null
          id?: string
          learning_style?: string | null
          org_id: string
          preferred_name?: string | null
          tag?: string | null
          team?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          favorites?: Json
          hire_date?: string | null
          id?: string
          learning_style?: string | null
          org_id?: string
          preferred_name?: string | null
          tag?: string | null
          team?: string | null
          timezone?: string | null
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
      escalation_policies: {
        Row: {
          created_at: string
          escalate_after_days: number
          escalate_to: string | null
          id: string
          is_active: boolean
          kind: string
          org_id: string
          review_due_days: number
          reviewer_role: string
          threshold_count: number
          threshold_window_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          escalate_after_days?: number
          escalate_to?: string | null
          id?: string
          is_active?: boolean
          kind: string
          org_id: string
          review_due_days?: number
          reviewer_role?: string
          threshold_count?: number
          threshold_window_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          escalate_after_days?: number
          escalate_to?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          org_id?: string
          review_due_days?: number
          reviewer_role?: string
          threshold_count?: number
          threshold_window_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_policies_org_id_fkey"
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
      goal_reminder_log: {
        Row: {
          channel: string | null
          created_at: string
          days_left: number | null
          due_date: string | null
          id: string
          item_id: string | null
          item_title: string | null
          org_id: string | null
          outcome: string
          owner_user_id: string | null
          reason: string | null
          run_date: string
          run_hour: number
        }
        Insert: {
          channel?: string | null
          created_at?: string
          days_left?: number | null
          due_date?: string | null
          id?: string
          item_id?: string | null
          item_title?: string | null
          org_id?: string | null
          outcome: string
          owner_user_id?: string | null
          reason?: string | null
          run_date: string
          run_hour: number
        }
        Update: {
          channel?: string | null
          created_at?: string
          days_left?: number | null
          due_date?: string | null
          id?: string
          item_id?: string | null
          item_title?: string | null
          org_id?: string | null
          outcome?: string
          owner_user_id?: string | null
          reason?: string | null
          run_date?: string
          run_hour?: number
        }
        Relationships: []
      }
      goal_reminder_prefs: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          org_id: string
          reminder_hour: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          org_id: string
          reminder_hour?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          org_id?: string
          reminder_hour?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      knowledge_acknowledgment_escalation_settings: {
        Row: {
          created_at: string
          email_after_workdays: number
          manager_after_workdays: number
          max_snooze_workdays: number
          max_snoozes: number
          org_id: string
          owner_after_workdays: number
          question_pauses_escalation: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          routine_reminders_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_after_workdays?: number
          manager_after_workdays?: number
          max_snooze_workdays?: number
          max_snoozes?: number
          org_id: string
          owner_after_workdays?: number
          question_pauses_escalation?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          routine_reminders_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_after_workdays?: number
          manager_after_workdays?: number
          max_snooze_workdays?: number
          max_snoozes?: number
          org_id?: string
          owner_after_workdays?: number
          question_pauses_escalation?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          routine_reminders_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_acknowledgment_escalation_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_acknowledgment_events: {
        Row: {
          actor_user_id: string | null
          assignment_id: string
          channel: string
          created_at: string
          detail: string
          event_key: string
          event_type: string
          id: string
          metadata: Json
          org_id: string
          recipient_user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          assignment_id: string
          channel?: string
          created_at?: string
          detail?: string
          event_key: string
          event_type: string
          id?: string
          metadata?: Json
          org_id: string
          recipient_user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          assignment_id?: string
          channel?: string
          created_at?: string
          detail?: string
          event_key?: string
          event_type?: string
          id?: string
          metadata?: Json
          org_id?: string
          recipient_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_acknowledgment_events_assignment_fk"
            columns: ["assignment_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_acknowledgments"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_acknowledgment_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_acknowledgments: {
        Row: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_at?: string
          blocked_at?: string | null
          blocked_reason?: string
          blocking_user_id?: string | null
          created_at?: string
          due_at: string
          employee_id?: string | null
          escalation_level?: number
          first_viewed_at?: string | null
          id?: string
          last_escalated_at?: string | null
          next_escalation_at?: string | null
          org_id: string
          overdue_at?: string | null
          question_asked_at?: string | null
          question_resolution?: string
          question_resolved_at?: string | null
          question_text?: string
          role_at_assignment: string
          signed_name?: string
          snooze_count?: number
          snooze_reason?: string
          snoozed_until?: string | null
          statement_snapshot: string
          title_snapshot?: string
          updated_at?: string
          user_id: string
          version_id: string
          version_number_snapshot?: number
          waived_at?: string | null
          waived_reason?: string
        }
        Update: {
          acknowledged_at?: string | null
          assigned_at?: string
          blocked_at?: string | null
          blocked_reason?: string
          blocking_user_id?: string | null
          created_at?: string
          due_at?: string
          employee_id?: string | null
          escalation_level?: number
          first_viewed_at?: string | null
          id?: string
          last_escalated_at?: string | null
          next_escalation_at?: string | null
          org_id?: string
          overdue_at?: string | null
          question_asked_at?: string | null
          question_resolution?: string
          question_resolved_at?: string | null
          question_text?: string
          role_at_assignment?: string
          signed_name?: string
          snooze_count?: number
          snooze_reason?: string
          snoozed_until?: string | null
          statement_snapshot?: string
          title_snapshot?: string
          updated_at?: string
          user_id?: string
          version_id?: string
          version_number_snapshot?: number
          waived_at?: string | null
          waived_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_acknowledgments_employee_fk"
            columns: ["employee_id", "org_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_acknowledgments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_acknowledgments_version_fk"
            columns: ["version_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      knowledge_blocks: {
        Row: {
          block_key: string
          block_type: string
          created_at: string
          data: Json
          id: string
          org_id: string
          plain_text: string
          sort_order: number
          updated_at: string
          version_id: string
        }
        Insert: {
          block_key?: string
          block_type: string
          created_at?: string
          data?: Json
          id?: string
          org_id: string
          plain_text?: string
          sort_order?: number
          updated_at?: string
          version_id: string
        }
        Update: {
          block_key?: string
          block_type?: string
          created_at?: string
          data?: Json
          id?: string
          org_id?: string
          plain_text?: string
          sort_order?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_blocks_version_fk"
            columns: ["version_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      knowledge_categories: {
        Row: {
          area: string
          created_at: string
          created_by: string
          description: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          area: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          area?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_categories_parent_org_fk"
            columns: ["parent_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      knowledge_evidence: {
        Row: {
          confidence: number
          created_at: string
          created_by: string
          excerpt: string
          id: string
          office_doc_chunk_id: string | null
          office_doc_id: string | null
          org_id: string
          relation: string
          source_label: string
          source_page: number | null
          version_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by: string
          excerpt?: string
          id?: string
          office_doc_chunk_id?: string | null
          office_doc_id?: string | null
          org_id: string
          relation?: string
          source_label?: string
          source_page?: number | null
          version_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string
          excerpt?: string
          id?: string
          office_doc_chunk_id?: string | null
          office_doc_id?: string | null
          org_id?: string
          relation?: string
          source_label?: string
          source_page?: number | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_evidence_office_doc_chunk_org_fk"
            columns: ["office_doc_chunk_id", "org_id"]
            isOneToOne: false
            referencedRelation: "office_doc_chunks"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_evidence_office_doc_org_fk"
            columns: ["office_doc_id", "org_id"]
            isOneToOne: false
            referencedRelation: "office_docs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_evidence_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_evidence_version_fk"
            columns: ["version_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          audience_roles: string[]
          category_id: string | null
          created_at: string
          created_by: string
          current_published_version_id: string | null
          id: string
          kind: string
          org_id: string
          slug: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          audience_roles?: string[]
          category_id?: string | null
          created_at?: string
          created_by: string
          current_published_version_id?: string | null
          id?: string
          kind: string
          org_id: string
          slug: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          audience_roles?: string[]
          category_id?: string | null
          created_at?: string
          created_by?: string
          current_published_version_id?: string | null
          id?: string
          kind?: string
          org_id?: string
          slug?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_category_fk"
            columns: ["category_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_items_current_version_same_item_fk"
            columns: ["current_published_version_id", "org_id", "id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id", "item_id"]
          },
          {
            foreignKeyName: "knowledge_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_reviews: {
        Row: {
          decided_at: string
          decision: string
          id: string
          note: string
          org_id: string
          reviewer_user_id: string
          version_id: string
        }
        Insert: {
          decided_at?: string
          decision: string
          id?: string
          note?: string
          org_id: string
          reviewer_user_id: string
          version_id: string
        }
        Update: {
          decided_at?: string
          decision?: string
          id?: string
          note?: string
          org_id?: string
          reviewer_user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_reviews_version_fk"
            columns: ["version_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      knowledge_versions: {
        Row: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          acknowledgment_due_days?: number | null
          acknowledgment_required?: boolean
          acknowledgment_statement?: string
          approved_at?: string | null
          approved_by?: string | null
          audience_roles?: string[]
          based_on_version_id?: string | null
          category_id?: string | null
          change_summary?: string
          created_at?: string
          created_by: string
          effective_on?: string | null
          id?: string
          item_id: string
          org_id: string
          published_at?: string | null
          published_by?: string | null
          review_due_on?: string | null
          source_kind?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          summary?: string
          title: string
          updated_at?: string
          version_number: number
        }
        Update: {
          acknowledgment_due_days?: number | null
          acknowledgment_required?: boolean
          acknowledgment_statement?: string
          approved_at?: string | null
          approved_by?: string | null
          audience_roles?: string[]
          based_on_version_id?: string | null
          category_id?: string | null
          change_summary?: string
          created_at?: string
          created_by?: string
          effective_on?: string | null
          id?: string
          item_id?: string
          org_id?: string
          published_at?: string | null
          published_by?: string | null
          review_due_on?: string | null
          source_kind?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          summary?: string
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_versions_based_on_same_item_fk"
            columns: ["based_on_version_id", "org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id", "item_id"]
          },
          {
            foreignKeyName: "knowledge_versions_category_fk"
            columns: ["category_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_versions_item_fk"
            columns: ["item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "knowledge_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_templates: {
        Row: {
          body: string
          category: string
          closing: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          status: string
          subject: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body: string
          category?: string
          closing?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          status?: string
          subject?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          category?: string
          closing?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          status?: string
          subject?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_templates_org_id_fkey"
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
      marketing_leads: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          name: string
          note: string | null
          office_size: string | null
          practice_name: string | null
          role: string | null
          source: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          name: string
          note?: string | null
          office_size?: string | null
          practice_name?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          name?: string
          note?: string | null
          office_size?: string | null
          practice_name?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      member_onboarding: {
        Row: {
          basics_done_at: string | null
          completed_at: string | null
          created_at: string
          goal_done_at: string | null
          id: string
          org_id: string
          terms_done_at: string | null
          updated_at: string
          user_id: string
          work_style_done_at: string | null
        }
        Insert: {
          basics_done_at?: string | null
          completed_at?: string | null
          created_at?: string
          goal_done_at?: string | null
          id?: string
          org_id: string
          terms_done_at?: string | null
          updated_at?: string
          user_id: string
          work_style_done_at?: string | null
        }
        Update: {
          basics_done_at?: string | null
          completed_at?: string | null
          created_at?: string
          goal_done_at?: string | null
          id?: string
          org_id?: string
          terms_done_at?: string | null
          updated_at?: string
          user_id?: string
          work_style_done_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_onboarding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          conversation_id: string
          created_at: string
          file_name: string
          id: string
          message_id: string
          mime_type: string
          org_id: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          file_name: string
          id?: string
          message_id: string
          mime_type: string
          org_id: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          uploaded_by?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string
          mime_type?: string
          org_id?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          org_id: string
          reported_at: string | null
          reported_by: string | null
          sender_id: string | null
          sender_kind: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          org_id: string
          reported_at?: string | null
          reported_by?: string | null
          sender_id?: string | null
          sender_kind?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          org_id?: string
          reported_at?: string | null
          reported_by?: string | null
          sender_id?: string | null
          sender_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_prefs: {
        Row: {
          animations_muted: boolean
          org_id: string
          receive_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          animations_muted?: boolean
          org_id: string
          receive_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          animations_muted?: boolean
          org_id?: string
          receive_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_prefs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
          chunk_type: string
          content: string
          doc_id: string
          heading_level: number | null
          id: string
          meta: Json | null
          org_id: string
          page_end: number | null
          page_number: number | null
          parent_section_title: string | null
          parse_version: number
          section_id: string | null
          section_title: string | null
          tsv: unknown
        }
        Insert: {
          chunk_index: number
          chunk_type?: string
          content: string
          doc_id: string
          heading_level?: number | null
          id?: string
          meta?: Json | null
          org_id: string
          page_end?: number | null
          page_number?: number | null
          parent_section_title?: string | null
          parse_version?: number
          section_id?: string | null
          section_title?: string | null
          tsv?: unknown
        }
        Update: {
          chunk_index?: number
          chunk_type?: string
          content?: string
          doc_id?: string
          heading_level?: number | null
          id?: string
          meta?: Json | null
          org_id?: string
          page_end?: number | null
          page_number?: number | null
          parent_section_title?: string | null
          parse_version?: number
          section_id?: string | null
          section_title?: string | null
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
          carrier: string | null
          category: string
          char_count: number
          collection: string
          created_at: string
          current_parse_version: number
          doc_status: string
          effective_date: string | null
          file_path: string | null
          id: string
          library_area: string
          manual_type: string | null
          mime_type: string | null
          org_id: string
          page_count: number | null
          parse_confidence: string | null
          parse_meta: Json | null
          parse_status: string
          replaces_doc_id: string | null
          section_count: number | null
          section_overrides: Json
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          carrier?: string | null
          category?: string
          char_count?: number
          collection?: string
          created_at?: string
          current_parse_version?: number
          doc_status?: string
          effective_date?: string | null
          file_path?: string | null
          id?: string
          library_area?: string
          manual_type?: string | null
          mime_type?: string | null
          org_id: string
          page_count?: number | null
          parse_confidence?: string | null
          parse_meta?: Json | null
          parse_status?: string
          replaces_doc_id?: string | null
          section_count?: number | null
          section_overrides?: Json
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          carrier?: string | null
          category?: string
          char_count?: number
          collection?: string
          created_at?: string
          current_parse_version?: number
          doc_status?: string
          effective_date?: string | null
          file_path?: string | null
          id?: string
          library_area?: string
          manual_type?: string | null
          mime_type?: string | null
          org_id?: string
          page_count?: number | null
          parse_confidence?: string | null
          parse_meta?: Json | null
          parse_status?: string
          replaces_doc_id?: string | null
          section_count?: number | null
          section_overrides?: Json
          title?: string
          updated_at?: string
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
          {
            foreignKeyName: "office_docs_replaces_doc_id_fkey"
            columns: ["replaces_doc_id"]
            isOneToOne: false
            referencedRelation: "office_docs"
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
      office_nudges: {
        Row: {
          content: string
          created_at: string
          data_refs: Json
          id: string
          kind: string
          org_id: string
          resolved_at: string | null
          status: string
          surface: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          data_refs?: Json
          id?: string
          kind: string
          org_id: string
          resolved_at?: string | null
          status?: string
          surface: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          data_refs?: Json
          id?: string
          kind?: string
          org_id?: string
          resolved_at?: string | null
          status?: string
          surface?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_nudges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      office_request_replies: {
        Row: {
          body: string
          created_at: string
          first_seen_at: string | null
          id: string
          org_id: string
          request_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          first_seen_at?: string | null
          id?: string
          org_id: string
          request_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          first_seen_at?: string | null
          id?: string
          org_id?: string
          request_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_request_replies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_request_replies_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "office_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      office_requests: {
        Row: {
          acknowledged_at: string | null
          category: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          first_seen_at: string | null
          id: string
          needs_reply: boolean
          note: string
          org_id: string
          recipient_id: string
          reference: string | null
          sender_id: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          first_seen_at?: string | null
          id?: string
          needs_reply?: boolean
          note: string
          org_id: string
          recipient_id: string
          reference?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          first_seen_at?: string | null
          id?: string
          needs_reply?: boolean
          note?: string
          org_id?: string
          recipient_id?: string
          reference?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_instance_items: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          instance_id: string
          item_detail: string
          item_title: string
          org_id: string
          section_sort: number
          section_title: string
          sort_order: number
          trainee_attestation_id: string | null
          trainee_initials: string
          trainee_signed_at: string | null
          trainer_attestation_id: string | null
          trainer_employee_id: string | null
          trainer_initials: string
          trainer_signed_at: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          instance_id: string
          item_detail?: string
          item_title: string
          org_id: string
          section_sort?: number
          section_title: string
          sort_order?: number
          trainee_attestation_id?: string | null
          trainee_initials?: string
          trainee_signed_at?: string | null
          trainer_attestation_id?: string | null
          trainer_employee_id?: string | null
          trainer_initials?: string
          trainer_signed_at?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          instance_id?: string
          item_detail?: string
          item_title?: string
          org_id?: string
          section_sort?: number
          section_title?: string
          sort_order?: number
          trainee_attestation_id?: string | null
          trainee_initials?: string
          trainee_signed_at?: string | null
          trainer_attestation_id?: string | null
          trainer_employee_id?: string | null
          trainer_initials?: string
          trainer_signed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_instance_items_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "onboarding_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_instance_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_instance_items_trainee_attestation_id_fkey"
            columns: ["trainee_attestation_id"]
            isOneToOne: false
            referencedRelation: "attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_instance_items_trainer_attestation_id_fkey"
            columns: ["trainer_attestation_id"]
            isOneToOne: false
            referencedRelation: "attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_instance_items_trainer_employee_id_org_id_fkey"
            columns: ["trainer_employee_id", "org_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      onboarding_instances: {
        Row: {
          completed_at: string | null
          created_at: string
          employee_id: string
          hr_report_id: string | null
          id: string
          org_id: string
          role_label: string
          started_at: string
          started_by: string | null
          status: string
          template_id: string | null
          template_name: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id: string
          hr_report_id?: string | null
          id?: string
          org_id: string
          role_label?: string
          started_at?: string
          started_by?: string | null
          status?: string
          template_id?: string | null
          template_name: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          hr_report_id?: string | null
          id?: string
          org_id?: string
          role_label?: string
          started_at?: string
          started_by?: string | null
          status?: string
          template_id?: string | null
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_instances_employee_id_org_id_fkey"
            columns: ["employee_id", "org_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "onboarding_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_template_items: {
        Row: {
          created_at: string
          detail: string
          id: string
          org_id: string
          section_id: string
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          org_id: string
          section_id: string
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          org_id?: string
          section_id?: string
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "onboarding_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_template_sections: {
        Row: {
          created_at: string
          id: string
          org_id: string
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          role_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          role_label?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          role_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_org_id_fkey"
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
          membership_row_label: string
          office_copy_note: string
          org_id: string
          outside_financing_label: string
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
          membership_row_label?: string
          office_copy_note?: string
          org_id: string
          outside_financing_label?: string
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
          membership_row_label?: string
          office_copy_note?: string
          org_id?: string
          outside_financing_label?: string
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
          initial_pto_hours: number | null
          invited_by: string | null
          invited_name: string | null
          operational_role: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_org_role"]
          secondary_roles: string[]
          start_date: string | null
          token: string
          weekly_schedule: Json
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          initial_pto_hours?: number | null
          invited_by?: string | null
          invited_name?: string | null
          operational_role?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_org_role"]
          secondary_roles?: string[]
          start_date?: string | null
          token?: string
          weekly_schedule?: Json
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          initial_pto_hours?: number | null
          invited_by?: string | null
          invited_name?: string | null
          operational_role?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_org_role"]
          secondary_roles?: string[]
          start_date?: string | null
          token?: string
          weekly_schedule?: Json
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
      org_messaging_settings: {
        Row: {
          categories: string[]
          closeout_cutoff_minutes: number
          closeout_item_enabled: boolean
          created_at: string
          doctor_recipient_label: string
          enabled: boolean
          messages_label: string
          org_id: string
          requests_label: string
          retention_days: number
          updated_at: string
        }
        Insert: {
          categories?: string[]
          closeout_cutoff_minutes?: number
          closeout_item_enabled?: boolean
          created_at?: string
          doctor_recipient_label?: string
          enabled?: boolean
          messages_label?: string
          org_id: string
          requests_label?: string
          retention_days?: number
          updated_at?: string
        }
        Update: {
          categories?: string[]
          closeout_cutoff_minutes?: number
          closeout_item_enabled?: boolean
          created_at?: string
          doctor_recipient_label?: string
          enabled?: boolean
          messages_label?: string
          org_id?: string
          requests_label?: string
          retention_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_messaging_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_moment_settings: {
        Row: {
          allow_message: boolean
          enabled: boolean
          history_retention_days: number
          max_per_pair_per_day: number
          max_per_sender_per_hour: number
          org_id: string
          unseen_expiry_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_message?: boolean
          enabled?: boolean
          history_retention_days?: number
          max_per_pair_per_day?: number
          max_per_sender_per_hour?: number
          org_id: string
          unseen_expiry_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_message?: boolean
          enabled?: boolean
          history_retention_days?: number
          max_per_pair_per_day?: number
          max_per_sender_per_hour?: number
          org_id?: string
          unseen_expiry_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_moment_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_permission_delegation: {
        Row: {
          managers_can_manage: boolean
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          managers_can_manage?: boolean
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          managers_can_manage?: boolean
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_permission_delegation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_practice_settings: {
        Row: {
          collections_visibility: string
          confirmation_lead_days: number
          created_at: string
          id: string
          mobile_capture_enabled: boolean
          monthly_collections_target_cents: number | null
          monthly_new_patients_seen_target_count: number | null
          monthly_production_target_cents: number | null
          new_patients_visibility: string
          onboarding_review_days: number[]
          org_id: string
          pin_lockout_attempts: number
          pin_lockout_minutes: number
          pms_system: string
          production_visibility: string
          require_pin_on_signoff: boolean
          roleplay_notes: string | null
          roleplay_persona_style: string
          roleplay_policy_tone: string
          security_alert_managers: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          collections_visibility?: string
          confirmation_lead_days?: number
          created_at?: string
          id?: string
          mobile_capture_enabled?: boolean
          monthly_collections_target_cents?: number | null
          monthly_new_patients_seen_target_count?: number | null
          monthly_production_target_cents?: number | null
          new_patients_visibility?: string
          onboarding_review_days?: number[]
          org_id: string
          pin_lockout_attempts?: number
          pin_lockout_minutes?: number
          pms_system?: string
          production_visibility?: string
          require_pin_on_signoff?: boolean
          roleplay_notes?: string | null
          roleplay_persona_style?: string
          roleplay_policy_tone?: string
          security_alert_managers?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          collections_visibility?: string
          confirmation_lead_days?: number
          created_at?: string
          id?: string
          mobile_capture_enabled?: boolean
          monthly_collections_target_cents?: number | null
          monthly_new_patients_seen_target_count?: number | null
          monthly_production_target_cents?: number | null
          new_patients_visibility?: string
          onboarding_review_days?: number[]
          org_id?: string
          pin_lockout_attempts?: number
          pin_lockout_minutes?: number
          pms_system?: string
          production_visibility?: string
          require_pin_on_signoff?: boolean
          roleplay_notes?: string | null
          roleplay_persona_style?: string
          roleplay_policy_tone?: string
          security_alert_managers?: boolean
          timezone?: string
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
      org_providers: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          employee_id: string | null
          id: string
          org_id: string
          provider_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          employee_id?: string | null
          id?: string
          org_id: string
          provider_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          employee_id?: string | null
          id?: string
          org_id?: string
          provider_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_providers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_providers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
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
      owner_board_prefs: {
        Row: {
          created_at: string
          digest_frequency: string
          org_id: string
          share_with_manager: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_frequency?: string
          org_id: string
          share_with_manager?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_frequency?: string
          org_id?: string
          share_with_manager?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_board_prefs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
      policy_acknowledgments: {
        Row: {
          created_at: string
          document: string
          id: string
          org_id: string
          signed_at: string
          signed_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document: string
          id?: string
          org_id: string
          signed_at?: string
          signed_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          document?: string
          id?: string
          org_id?: string
          signed_at?: string
          signed_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acknowledgments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_setup_finding_sources: {
        Row: {
          created_at: string
          finding_id: string
          org_id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          finding_id: string
          org_id: string
          source_id: string
        }
        Update: {
          created_at?: string
          finding_id?: string
          org_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_setup_finding_sources_finding_fk"
            columns: ["finding_id", "org_id"]
            isOneToOne: false
            referencedRelation: "practice_setup_findings"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "practice_setup_finding_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_setup_finding_sources_source_fk"
            columns: ["source_id", "org_id"]
            isOneToOne: false
            referencedRelation: "practice_setup_sources"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      practice_setup_findings: {
        Row: {
          created_at: string
          detail: string
          finding_type: string
          group_key: string
          id: string
          org_id: string
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string
          finding_type: string
          group_key: string
          id?: string
          org_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id: string
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string
          finding_type?: string
          group_key?: string
          id?: string
          org_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_setup_findings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_setup_findings_session_fk"
            columns: ["session_id", "org_id"]
            isOneToOne: false
            referencedRelation: "practice_setup_sessions"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      practice_setup_sessions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          id: string
          last_scanned_at: string | null
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_scanned_at?: string | null
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_scanned_at?: string | null
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_setup_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_setup_sources: {
        Row: {
          confidence: number
          confirmed_action: string | null
          confirmed_category_id: string | null
          converted_item_id: string | null
          converted_version_id: string | null
          created_at: string
          duplicate_key: string
          id: string
          office_doc_id: string
          org_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: string
          suggested_action: string
          suggestion_reason: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          confirmed_action?: string | null
          confirmed_category_id?: string | null
          converted_item_id?: string | null
          converted_version_id?: string | null
          created_at?: string
          duplicate_key?: string
          id?: string
          office_doc_id: string
          org_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status?: string
          suggested_action: string
          suggestion_reason?: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          confirmed_action?: string | null
          confirmed_category_id?: string | null
          converted_item_id?: string | null
          converted_version_id?: string | null
          created_at?: string
          duplicate_key?: string
          id?: string
          office_doc_id?: string
          org_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: string
          suggested_action?: string
          suggestion_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_setup_sources_category_fk"
            columns: ["confirmed_category_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "practice_setup_sources_doc_fk"
            columns: ["office_doc_id", "org_id"]
            isOneToOne: false
            referencedRelation: "office_docs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "practice_setup_sources_item_fk"
            columns: ["converted_item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "practice_setup_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_setup_sources_session_fk"
            columns: ["session_id", "org_id"]
            isOneToOne: false
            referencedRelation: "practice_setup_sessions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "practice_setup_sources_version_item_fk"
            columns: ["converted_version_id", "org_id", "converted_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id", "org_id", "item_id"]
          },
        ]
      }
      procedure_meta: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          internal_description: string
          keywords: string[]
          needs_surfaces: boolean
          needs_teeth: boolean
          org_id: string
          patient_name: string
          quantity_strategy: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          internal_description?: string
          keywords?: string[]
          needs_surfaces?: boolean
          needs_teeth?: boolean
          org_id: string
          patient_name?: string
          quantity_strategy?: string
          unit_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          internal_description?: string
          keywords?: string[]
          needs_surfaces?: boolean
          needs_teeth?: boolean
          org_id?: string
          patient_name?: string
          quantity_strategy?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_meta_org_id_fkey"
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
          initials: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          initials?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          initials?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_day_metrics: {
        Row: {
          active_columns: number
          automated_workload_class: string | null
          business_date: string
          cancellation_count: number
          cancellation_open_minutes: number
          closeout_id: string
          confidence: number
          continuous_without_buffer_minutes: number | null
          created_at: string
          created_by: string
          department: string
          employee_id: string | null
          gross_available_minutes: number
          id: string
          intentional_unavailable_minutes: number
          longest_booked_stretch_minutes: number | null
          net_bookable_minutes: number
          no_show_count: number
          no_show_open_minutes: number
          org_id: string
          other_open_minutes: number
          overlap_minutes: number | null
          provider_label: string
          provider_role: string
          recovered_minutes: number | null
          recovered_open_pct: number | null
          review_status: string
          same_day_additions: number | null
          schedule_density: number | null
          schedule_volatility: number | null
          scheduled_minutes: number
          simultaneous_column_minutes: number | null
          staffing_to_column_ratio: number | null
          support_staff_assigned: number | null
          true_open_minutes: number
          unclassified_minutes: number
          updated_at: string
        }
        Insert: {
          active_columns?: number
          automated_workload_class?: string | null
          business_date: string
          cancellation_count?: number
          cancellation_open_minutes?: number
          closeout_id: string
          confidence?: number
          continuous_without_buffer_minutes?: number | null
          created_at?: string
          created_by: string
          department: string
          employee_id?: string | null
          gross_available_minutes?: number
          id?: string
          intentional_unavailable_minutes?: number
          longest_booked_stretch_minutes?: number | null
          net_bookable_minutes?: number
          no_show_count?: number
          no_show_open_minutes?: number
          org_id: string
          other_open_minutes?: number
          overlap_minutes?: number | null
          provider_label: string
          provider_role: string
          recovered_minutes?: number | null
          recovered_open_pct?: number | null
          review_status?: string
          same_day_additions?: number | null
          schedule_density?: number | null
          schedule_volatility?: number | null
          scheduled_minutes?: number
          simultaneous_column_minutes?: number | null
          staffing_to_column_ratio?: number | null
          support_staff_assigned?: number | null
          true_open_minutes?: number
          unclassified_minutes?: number
          updated_at?: string
        }
        Update: {
          active_columns?: number
          automated_workload_class?: string | null
          business_date?: string
          cancellation_count?: number
          cancellation_open_minutes?: number
          closeout_id?: string
          confidence?: number
          continuous_without_buffer_minutes?: number | null
          created_at?: string
          created_by?: string
          department?: string
          employee_id?: string | null
          gross_available_minutes?: number
          id?: string
          intentional_unavailable_minutes?: number
          longest_booked_stretch_minutes?: number | null
          net_bookable_minutes?: number
          no_show_count?: number
          no_show_open_minutes?: number
          org_id?: string
          other_open_minutes?: number
          overlap_minutes?: number | null
          provider_label?: string
          provider_role?: string
          recovered_minutes?: number | null
          recovered_open_pct?: number | null
          review_status?: string
          same_day_additions?: number | null
          schedule_density?: number | null
          schedule_volatility?: number | null
          scheduled_minutes?: number
          simultaneous_column_minutes?: number | null
          staffing_to_column_ratio?: number | null
          support_staff_assigned?: number | null
          true_open_minutes?: number
          unclassified_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_day_metrics_closeout_id_fkey"
            columns: ["closeout_id"]
            isOneToOne: false
            referencedRelation: "deposit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_day_metrics_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_day_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
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
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
      reminder_hooks: {
        Row: {
          created_at: string
          fire_at: string
          id: string
          kind: string
          org_id: string
          payload: Json
          ref_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fire_at: string
          id?: string
          kind: string
          org_id: string
          payload?: Json
          ref_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fire_at?: string
          id?: string
          kind?: string
          org_id?: string
          payload?: Json
          ref_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_hooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
      schedule_block_entries: {
        Row: {
          business_date: string
          classification_code: string
          closeout_id: string
          confidence: number
          created_at: string
          created_by: string
          department: string | null
          excluded_minutes: number
          id: string
          org_id: string
          provider_label: string | null
          user_confirmed: boolean
        }
        Insert: {
          business_date: string
          classification_code: string
          closeout_id: string
          confidence?: number
          created_at?: string
          created_by: string
          department?: string | null
          excluded_minutes?: number
          id?: string
          org_id: string
          provider_label?: string | null
          user_confirmed?: boolean
        }
        Update: {
          business_date?: string
          classification_code?: string
          closeout_id?: string
          confidence?: number
          created_at?: string
          created_by?: string
          department?: string | null
          excluded_minutes?: number
          id?: string
          org_id?: string
          provider_label?: string | null
          user_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "schedule_block_entries_closeout_id_fkey"
            columns: ["closeout_id"]
            isOneToOne: false
            referencedRelation: "deposit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_block_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
      schedule_layout_profiles: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          layout_signature: Json
          name: string
          org_id: string
          pms_name: string | null
          status_legend: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout_signature: Json
          name: string
          org_id: string
          pms_name?: string | null
          status_legend: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout_signature?: Json
          name?: string
          org_id?: string
          pms_name?: string | null
          status_legend?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_layout_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_phrase_rules: {
        Row: {
          classification_code: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          org_id: string
          phrase: string
        }
        Insert: {
          classification_code: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          org_id: string
          phrase: string
        }
        Update: {
          classification_code?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          org_id?: string
          phrase?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_phrase_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_staffing_rules: {
        Row: {
          applies_on_weekdays: number[] | null
          created_at: string
          department: string
          id: string
          is_active: boolean
          max_simultaneous_columns: number | null
          org_id: string
          provider_count: number
          provider_role: string
          support_count: number | null
          support_role: string | null
          updated_at: string
        }
        Insert: {
          applies_on_weekdays?: number[] | null
          created_at?: string
          department: string
          id?: string
          is_active?: boolean
          max_simultaneous_columns?: number | null
          org_id: string
          provider_count: number
          provider_role: string
          support_count?: number | null
          support_role?: string | null
          updated_at?: string
        }
        Update: {
          applies_on_weekdays?: number[] | null
          created_at?: string
          department?: string
          id?: string
          is_active?: boolean
          max_simultaneous_columns?: number | null
          org_id?: string
          provider_count?: number
          provider_role?: string
          support_count?: number | null
          support_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_staffing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
      security_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: Json
          fingerprint: string
          id: string
          kind: string
          org_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          fingerprint: string
          id?: string
          kind: string
          org_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          fingerprint?: string
          id?: string
          kind?: string
          org_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_signatures: {
        Row: {
          allow_office_use: boolean
          created_at: string
          id: string
          org_id: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_office_use?: boolean
          created_at?: string
          id?: string
          org_id: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_office_use?: boolean
          created_at?: string
          id?: string
          org_id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_path: string | null
          author_user_id: string | null
          content: string
          created_at: string
          id: string
          ocr_text: string | null
          org_id: string
          role: string
          ticket_id: string
          tier: string | null
        }
        Insert: {
          attachment_path?: string | null
          author_user_id?: string | null
          content?: string
          created_at?: string
          id?: string
          ocr_text?: string | null
          org_id: string
          role: string
          ticket_id: string
          tier?: string | null
        }
        Update: {
          attachment_path?: string | null
          author_user_id?: string | null
          content?: string
          created_at?: string
          id?: string
          ocr_text?: string | null
          org_id?: string
          role?: string
          ticket_id?: string
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string | null
          context_label: string | null
          context_path: string | null
          created_at: string
          escalated_at: string | null
          id: string
          org_id: string
          page_path: string | null
          range_end: string | null
          range_start: string | null
          resolved_at: string | null
          severity: string | null
          status: string
          tier: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          context_label?: string | null
          context_path?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          org_id: string
          page_path?: string | null
          range_end?: string | null
          range_start?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string
          tier?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          context_label?: string | null
          context_path?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          org_id?: string
          page_path?: string | null
          range_end?: string | null
          range_start?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string
          tier?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      team_goals: {
        Row: {
          ai_suggested: boolean
          ai_verdict: Json | null
          category: string | null
          created_at: string
          created_by: string
          ends_on: string
          id: string
          metric: string
          org_id: string
          override_reason: string | null
          period: string
          progress: number
          reward: string
          scope: string
          scope_department: string | null
          scope_role: string | null
          scope_user_id: string | null
          starts_on: string
          status: string
          target_count: number
          title: string
          updated_at: string
          verification: string
          verification_doc_path: string | null
          verification_note: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_suggested?: boolean
          ai_verdict?: Json | null
          category?: string | null
          created_at?: string
          created_by: string
          ends_on: string
          id?: string
          metric: string
          org_id: string
          override_reason?: string | null
          period: string
          progress?: number
          reward: string
          scope?: string
          scope_department?: string | null
          scope_role?: string | null
          scope_user_id?: string | null
          starts_on: string
          status?: string
          target_count: number
          title: string
          updated_at?: string
          verification?: string
          verification_doc_path?: string | null
          verification_note?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_suggested?: boolean
          ai_verdict?: Json | null
          category?: string | null
          created_at?: string
          created_by?: string
          ends_on?: string
          id?: string
          metric?: string
          org_id?: string
          override_reason?: string | null
          period?: string
          progress?: number
          reward?: string
          scope?: string
          scope_department?: string | null
          scope_role?: string | null
          scope_user_id?: string | null
          starts_on?: string
          status?: string
          target_count?: number
          title?: string
          updated_at?: string
          verification?: string
          verification_doc_path?: string | null
          verification_note?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_moments: {
        Row: {
          claim_expires_at: string | null
          claimed_at: string | null
          context_label: string | null
          created_at: string
          dismissed_at: string | null
          expires_at: string
          id: string
          message: string | null
          opened_at: string | null
          org_id: string
          reaction: string
          recipient_employee_id: string
          recipient_user_id: string
          revealed_at: string | null
          sender_employee_id: string
          sender_user_id: string
        }
        Insert: {
          claim_expires_at?: string | null
          claimed_at?: string | null
          context_label?: string | null
          created_at?: string
          dismissed_at?: string | null
          expires_at: string
          id?: string
          message?: string | null
          opened_at?: string | null
          org_id: string
          reaction: string
          recipient_employee_id: string
          recipient_user_id: string
          revealed_at?: string | null
          sender_employee_id: string
          sender_user_id: string
        }
        Update: {
          claim_expires_at?: string | null
          claimed_at?: string | null
          context_label?: string | null
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string
          id?: string
          message?: string | null
          opened_at?: string | null
          org_id?: string
          reaction?: string
          recipient_employee_id?: string
          recipient_user_id?: string
          revealed_at?: string | null
          sender_employee_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_moments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_moments_recipient_employee_id_fkey"
            columns: ["recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_moments_sender_employee_id_fkey"
            columns: ["sender_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      training_audit_findings: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          fingerprint: string
          id: string
          module_id: string
          note: string
          org_id: string
          quote: string
          severity: string
          status: string
          suggested_fix: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          fingerprint: string
          id?: string
          module_id: string
          note?: string
          org_id: string
          quote?: string
          severity?: string
          status?: string
          suggested_fix?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          fingerprint?: string
          id?: string
          module_id?: string
          note?: string
          org_id?: string
          quote?: string
          severity?: string
          status?: string
          suggested_fix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_audit_findings_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_audit_findings_org_id_fkey"
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
          order_rev: number
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
          order_rev?: number
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
          order_rev?: number
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
      training_attempt_summary: {
        Row: {
          completed_at: string | null
          id: string | null
          module_id: string | null
          org_id: string | null
          passed: boolean | null
          score: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string | null
          module_id?: string | null
          org_id?: string | null
          passed?: boolean | null
          score?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string | null
          module_id?: string | null
          org_id?: string | null
          passed?: boolean | null
          score?: number | null
          type?: string | null
          user_id?: string | null
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
      _recompute_attendance_range_internal: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: number
      }
      _recompute_schedule_window: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: undefined
      }
      _record_punch_internal: {
        Args: {
          p_action: string
          p_actor?: string
          p_employee_id: string
          p_lat?: number
          p_lng?: number
          p_low_confidence?: boolean
          p_punch_time?: string
          p_source?: string
        }
        Returns: Json
      }
      acknowledge_knowledge_version: {
        Args: { p_assignment_id: string; p_typed_name: string }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acknowledge_knowledge_version_with_question: {
        Args: {
          p_assignment_id: string
          p_question?: string
          p_typed_name: string
        }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ask_knowledge_acknowledgment_question: {
        Args: { p_assignment_id: string; p_question: string }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      block_knowledge_acknowledgment: {
        Args: {
          p_assignment_id: string
          p_blocking_user_id?: string
          p_reason: string
        }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      board_shared_with_manager: {
        Args: { _owner_user_id: string }
        Returns: boolean
      }
      bump_team_goal: {
        Args: { _amount?: number; _goal_id: string }
        Returns: {
          ai_suggested: boolean
          ai_verdict: Json | null
          category: string | null
          created_at: string
          created_by: string
          ends_on: string
          id: string
          metric: string
          org_id: string
          override_reason: string | null
          period: string
          progress: number
          reward: string
          scope: string
          scope_department: string | null
          scope_role: string | null
          scope_user_id: string | null
          starts_on: string
          status: string
          target_count: number
          title: string
          updated_at: string
          verification: string
          verification_doc_path: string | null
          verification_note: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "team_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_access_employee: { Args: { _employee_id: string }; Returns: boolean }
      can_access_request: { Args: { _request_id: string }; Returns: boolean }
      can_manage_goal: { Args: { _goal_id: string }; Returns: boolean }
      can_manage_onboarding: { Args: { _org_id: string }; Returns: boolean }
      can_manage_permissions: { Args: { _org_id: string }; Returns: boolean }
      can_read_conv: { Args: { _conv: string }; Returns: boolean }
      can_view_goal: { Args: { _goal_id: string }; Returns: boolean }
      can_view_team_goal: { Args: { _goal_id: string }; Returns: boolean }
      claim_team_moments: {
        Args: { p_limit?: number; p_org_id: string }
        Returns: {
          claim_expires_at: string | null
          claimed_at: string | null
          context_label: string | null
          created_at: string
          dismissed_at: string | null
          expires_at: string
          id: string
          message: string | null
          opened_at: string | null
          org_id: string
          reaction: string
          recipient_employee_id: string
          recipient_user_id: string
          revealed_at: string | null
          sender_employee_id: string
          sender_user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "team_moments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_team_moments: { Args: never; Returns: number }
      configure_knowledge_acknowledgment: {
        Args: {
          p_due_days?: number
          p_required: boolean
          p_statement?: string
          p_version_id: string
        }
        Returns: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_practice_setup_source: {
        Args: { p_action: string; p_category_id?: string; p_source_id: string }
        Returns: {
          confidence: number
          confirmed_action: string | null
          confirmed_category_id: string | null
          converted_item_id: string | null
          converted_version_id: string | null
          created_at: string
          duplicate_key: string
          id: string
          office_doc_id: string
          org_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: string
          suggested_action: string
          suggestion_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "practice_setup_sources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consent_bundle_used: { Args: { p_bundle_id: string }; Returns: undefined }
      consent_team_can: {
        Args: { p_org_id: string; p_perm: string }
        Returns: boolean
      }
      conv_created_by: { Args: { _conv: string }; Returns: string }
      conv_type: { Args: { _conv: string }; Returns: string }
      convert_practice_setup_source: {
        Args: {
          p_blocks: Json
          p_source_id: string
          p_summary: string
          p_title: string
        }
        Returns: string
      }
      clear_employee_pin: { Args: { _employee_id: string }; Returns: undefined }
      correspondence_team_can: { Args: { p_org_id: string }; Returns: boolean }
      countersign_accountability_report: {
        Args: { _note: string; _report_id: string; _typed_name: string }
        Returns: undefined
      }
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
      create_knowledge_acknowledgment_assignments: {
        Args: { p_only_user_id?: string; p_version_id: string }
        Returns: number
      }
      create_knowledge_draft: {
        Args: {
          p_audience_roles?: string[]
          p_blocks?: Json
          p_category_id?: string
          p_kind: string
          p_org_id: string
          p_summary?: string
          p_title: string
        }
        Returns: string
      }
      create_knowledge_draft_with_acknowledgment: {
        Args: {
          p_acknowledgment_due_days?: number
          p_acknowledgment_required?: boolean
          p_acknowledgment_statement?: string
          p_audience_roles?: string[]
          p_blocks?: Json
          p_category_id?: string
          p_kind: string
          p_org_id: string
          p_summary?: string
          p_title: string
        }
        Returns: string
      }
      create_knowledge_revision: {
        Args: { p_item_id: string }
        Returns: string
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
      ensure_ai_conversation: { Args: never; Returns: string }
      ensure_default_knowledge_categories: {
        Args: { p_org_id: string }
        Returns: {
          area: string
          created_at: string
          created_by: string
          description: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "knowledge_categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_dm: { Args: { _other_user: string }; Returns: string }
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
      has_permission: {
        Args: { _org_id: string; _perm: string }
        Returns: boolean
      }
      incident_countersign_role: {
        Args: { _employee_id: string }
        Returns: string
      }
      initialize_practice_setup: { Args: { p_org_id: string }; Returns: string }
      is_allowed_user: { Args: never; Returns: boolean }
      is_conv_participant: { Args: { _conv: string }; Returns: boolean }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_org_owner: { Args: { _org_id: string }; Returns: boolean }
      knowledge_acknowledgment_user_is_eligible: {
        Args: {
          p_assignment: Database["public"]["Tables"]["knowledge_acknowledgments"]["Row"]
        }
        Returns: boolean
      }
      knowledge_add_working_days: {
        Args: {
          p_org_id: string
          p_start: string
          p_target_time?: string
          p_user_id: string
          p_workdays: number
        }
        Returns: string
      }
      knowledge_assert_category_matches_kind: {
        Args: { p_category_id: string; p_kind: string; p_org_id: string }
        Returns: undefined
      }
      knowledge_can_read_item: { Args: { p_item_id: string }; Returns: boolean }
      knowledge_can_read_version: {
        Args: { p_version_id: string }
        Returns: boolean
      }
      knowledge_current_role: { Args: { p_org_id: string }; Returns: string }
      knowledge_normalize_text: { Args: { value: string }; Returns: string }
      knowledge_record_acknowledgment_event: {
        Args: {
          p_actor_user_id?: string
          p_assignment_id: string
          p_channel?: string
          p_detail?: string
          p_event_key: string
          p_event_type: string
          p_metadata?: Json
          p_recipient_user_id?: string
        }
        Returns: boolean
      }
      knowledge_routine_notice_window: {
        Args: { p_at?: string; p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      knowledge_slugify: { Args: { p_value: string }; Returns: string }
      knowledge_unique_slug: {
        Args: {
          p_exclude_item_id?: string
          p_kind: string
          p_org_id: string
          p_title: string
        }
        Returns: string
      }
      knowledge_user_work_context: {
        Args: { p_date: string; p_org_id: string; p_user_id: string }
        Returns: {
          is_working: boolean
          reason: string
          work_end: string
          work_start: string
          work_timezone: string
        }[]
      }
      knowledge_validate_blocks: {
        Args: { p_blocks: Json }
        Returns: undefined
      }
      mark_conversation_read: { Args: { _conv: string }; Returns: undefined }
      mark_knowledge_acknowledgment_viewed: {
        Args: { p_assignment_id: string }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_accountability_reports: {
        Args: never
        Returns: {
          closed_at: string
          created_at: string
          id: string
          kind: string
          manager_note: string
          manager_signed_at: string
          manager_signed_name: string
          member_reason: string
          member_signed_at: string
          member_signed_name: string
          org_id: string
          period_end: string
          period_start: string
          status: string
          summary: string
        }[]
      }
      my_department: { Args: never; Returns: string }
      my_operational_roles: { Args: never; Returns: string[] }
      my_team: { Args: never; Returns: string }
      open_team_moments: { Args: { p_ids: string[] }; Returns: number }
      org_staff_directory: {
        Args: { p_org_id: string }
        Returns: {
          display_name: string
          employee_id: string
          employment_status: string
          membership_status: string
          tag: string
          user_id: string
        }[]
      }
      owns_goal: { Args: { _goal_id: string }; Returns: boolean }
      practice_setup_duplicate_key: {
        Args: { p_title: string }
        Returns: string
      }
      practice_setup_suggest_action: {
        Args: {
          p_char_count: number
          p_collection: string
          p_library_area: string
          p_title: string
        }
        Returns: {
          action: string
          confidence: number
          reason: string
        }[]
      }
      publish_knowledge_version: {
        Args: { p_version_id: string }
        Returns: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_messaging_retention: { Args: never; Returns: number }
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
      record_onboarding_signoff_fallback: {
        Args: {
          _initials: string
          _item_id: string
          _side: string
          _trainer_employee_id?: string
        }
        Returns: undefined
      }
      record_punch: { Args: { p_action: string }; Returns: Json }
      reorder_user_notes: {
        Args: { _expected_rev: number; _ordered_ids: string[] }
        Returns: {
          id: string
          order_rev: number
          sort_order: number
        }[]
      }
      report_message: {
        Args: { _message_id: string; _note?: string }
        Returns: undefined
      }
      request_attendance_recompute: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: number
      }
      resolve_knowledge_acknowledgment_question: {
        Args: { p_assignment_id: string; p_resolution: string }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_practice_setup_finding: {
        Args: { p_finding_id: string; p_status: string }
        Returns: {
          created_at: string
          detail: string
          finding_type: string
          group_key: string
          id: string
          org_id: string
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "practice_setup_findings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_knowledge_version: {
        Args: { p_decision: string; p_note?: string; p_version_id: string }
        Returns: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_knowledge_acknowledgment_escalation_settings: {
        Args: {
          p_email_after_workdays: number
          p_manager_after_workdays: number
          p_max_snooze_workdays: number
          p_max_snoozes: number
          p_org_id: string
          p_owner_after_workdays: number
          p_question_pauses_escalation: boolean
          p_quiet_hours_end: string
          p_quiet_hours_start: string
          p_routine_reminders_enabled: boolean
        }
        Returns: {
          created_at: string
          email_after_workdays: number
          manager_after_workdays: number
          max_snooze_workdays: number
          max_snoozes: number
          org_id: string
          owner_after_workdays: number
          question_pauses_escalation: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          routine_reminders_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgment_escalation_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_knowledge_draft: {
        Args: {
          p_audience_roles?: string[]
          p_blocks?: Json
          p_category_id?: string
          p_change_summary?: string
          p_summary?: string
          p_title: string
          p_version_id: string
        }
        Returns: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_knowledge_draft_with_acknowledgment: {
        Args: {
          p_acknowledgment_due_days?: number
          p_acknowledgment_required?: boolean
          p_acknowledgment_statement?: string
          p_audience_roles?: string[]
          p_blocks?: Json
          p_category_id?: string
          p_change_summary?: string
          p_summary?: string
          p_title: string
          p_version_id: string
        }
        Returns: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_punch_edits: {
        Args: {
          p_edits: Json
          p_employee_id?: string
          p_entry_date?: string
          p_entry_id: string
          p_reason: string
        }
        Returns: Json
      }
      search_office_doc_chunks: {
        Args: {
          p_collections?: string[]
          p_doc_ids?: string[]
          p_library_areas?: string[]
          p_limit?: number
          p_query: string
        }
        Returns: {
          category: string
          chunk_index: number
          chunk_type: string
          collection: string
          content: string
          doc_id: string
          library_area: string
          page_number: number
          parse_version: number
          rank: number
          section_id: string
          section_title: string
          title: string
        }[]
      }
      set_employee_pin: {
        Args: { _employee_id: string; _pin: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_accountability_report: {
        Args: { _reason: string; _report_id: string; _typed_name: string }
        Returns: undefined
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
      snooze_knowledge_acknowledgment: {
        Args: { p_assignment_id: string; p_reason: string; p_workdays: number }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_knowledge_version_for_review: {
        Args: { p_version_id: string }
        Returns: {
          acknowledgment_due_days: number | null
          acknowledgment_required: boolean
          acknowledgment_statement: string
          approved_at: string | null
          approved_by: string | null
          audience_roles: string[]
          based_on_version_id: string | null
          category_id: string | null
          change_summary: string
          created_at: string
          created_by: string
          effective_on: string | null
          id: string
          item_id: string
          org_id: string
          published_at: string | null
          published_by: string | null
          review_due_on: string | null
          source_kind: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summary: string
          title: string
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_onboarding_instance: {
        Args: { _employee_id: string; _template_id: string }
        Returns: string
      }
      sweep_accountability_escalations: { Args: never; Returns: number }
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
      unaccent: { Args: { value: string }; Returns: string }
      unblock_knowledge_acknowledgment: {
        Args: { p_assignment_id: string; p_note?: string }
        Returns: {
          acknowledged_at: string | null
          assigned_at: string
          blocked_at: string | null
          blocked_reason: string
          blocking_user_id: string | null
          created_at: string
          due_at: string
          employee_id: string | null
          escalation_level: number
          first_viewed_at: string | null
          id: string
          last_escalated_at: string | null
          next_escalation_at: string | null
          org_id: string
          overdue_at: string | null
          question_asked_at: string | null
          question_resolution: string
          question_resolved_at: string | null
          question_text: string
          role_at_assignment: string
          signed_name: string
          snooze_count: number
          snooze_reason: string
          snoozed_until: string | null
          statement_snapshot: string
          title_snapshot: string
          updated_at: string
          user_id: string
          version_id: string
          version_number_snapshot: number
          waived_at: string | null
          waived_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_acknowledgments"
          isOneToOne: true
          isSetofReturn: false
        }
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
