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
      activity_log: {
        Row: {
          company_id: string
          content: string
          id: string
          logged_at: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          id?: string
          logged_at?: string
          type?: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          id?: string
          logged_at?: string
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          domain: string | null
          email: string | null
          employee_count: number | null
          enrichment_status: string | null
          hunter_last_sync: string | null
          id: string
          industry: string | null
          is_reseller: boolean
          last_research_at: string | null
          lat: number | null
          linkedin_url: string | null
          lng: number | null
          market_insight: Json | null
          market_insight_at: string | null
          market_seed_urls: string[]
          mobile: string | null
          name: string
          phone: string | null
          product_service: string | null
          research_data: Json | null
          status: string
          status_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          email?: string | null
          employee_count?: number | null
          enrichment_status?: string | null
          hunter_last_sync?: string | null
          id?: string
          industry?: string | null
          is_reseller?: boolean
          last_research_at?: string | null
          lat?: number | null
          linkedin_url?: string | null
          lng?: number | null
          market_insight?: Json | null
          market_insight_at?: string | null
          market_seed_urls?: string[]
          mobile?: string | null
          name: string
          phone?: string | null
          product_service?: string | null
          research_data?: Json | null
          status?: string
          status_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          email?: string | null
          employee_count?: number | null
          enrichment_status?: string | null
          hunter_last_sync?: string | null
          id?: string
          industry?: string | null
          is_reseller?: boolean
          last_research_at?: string | null
          lat?: number | null
          linkedin_url?: string | null
          lng?: number | null
          market_insight?: Json | null
          market_insight_at?: string | null
          market_seed_urls?: string[]
          mobile?: string | null
          name?: string
          phone?: string | null
          product_service?: string | null
          research_data?: Json | null
          status?: string
          status_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          created_at: string
          description: string | null
          id: string
          product: string | null
          status: string
          target_value_cents: number
          title: string
          updated_at: string
          user_id: string
          won_lead_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          product?: string | null
          status?: string
          target_value_cents?: number
          title: string
          updated_at?: string
          user_id: string
          won_lead_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          product?: string | null
          status?: string
          target_value_cents?: number
          title?: string
          updated_at?: string
          user_id?: string
          won_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_won_lead_id_fkey"
            columns: ["won_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_activities: {
        Row: {
          body: string
          created_at: string
          id: string
          inquiry_id: string
          kind: string
          lead_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
          kind?: string
          lead_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          kind?: string
          lead_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_activities_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_leads: {
        Row: {
          id: string
          inquiry_id: string
          joined_at: string
          lead_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          inquiry_id: string
          joined_at?: string
          lead_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          inquiry_id?: string
          joined_at?: string
          lead_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_leads_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          lead_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_documents: {
        Row: {
          created_at: string
          file_name: string
          id: string
          label: string
          lead_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          label: string
          lead_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          label?: string
          lead_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          brands: string[]
          company_id: string | null
          company_name: string | null
          contact_email: string | null
          contact_person: string | null
          created_at: string
          department: string | null
          email_score: number | null
          email_status: string | null
          end_user_project: string | null
          hunter_confidence: number | null
          id: string
          job_title: string | null
          last_activity_at: string | null
          last_activity_kind: string | null
          last_activity_note: string | null
          last_verified_at: string | null
          lead_score: number
          lead_score_manual_override: boolean
          lead_type: string
          linkedin_url: string | null
          notes: string | null
          phone: string | null
          pipeline_value_cents: number
          products_services: string[]
          prospect_id: string | null
          reseller_company_id: string | null
          seniority: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          brands?: string[]
          company_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_person?: string | null
          created_at?: string
          department?: string | null
          email_score?: number | null
          email_status?: string | null
          end_user_project?: string | null
          hunter_confidence?: number | null
          id?: string
          job_title?: string | null
          last_activity_at?: string | null
          last_activity_kind?: string | null
          last_activity_note?: string | null
          last_verified_at?: string | null
          lead_score?: number
          lead_score_manual_override?: boolean
          lead_type?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_value_cents?: number
          products_services?: string[]
          prospect_id?: string | null
          reseller_company_id?: string | null
          seniority?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          brands?: string[]
          company_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_person?: string | null
          created_at?: string
          department?: string | null
          email_score?: number | null
          email_status?: string | null
          end_user_project?: string | null
          hunter_confidence?: number | null
          id?: string
          job_title?: string | null
          last_activity_at?: string | null
          last_activity_kind?: string | null
          last_activity_note?: string | null
          last_verified_at?: string | null
          lead_score?: number
          lead_score_manual_override?: boolean
          lead_type?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_value_cents?: number
          products_services?: string[]
          prospect_id?: string | null
          reseller_company_id?: string | null
          seniority?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_reseller_company_id_fkey"
            columns: ["reseller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_entries: {
        Row: {
          ai_response: string | null
          category: Database["public"]["Enums"]["learning_category"]
          company_id: string | null
          content: string
          created_at: string
          engine: string | null
          final_response: string | null
          id: string
          original_input: string | null
          situation: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_response?: string | null
          category: Database["public"]["Enums"]["learning_category"]
          company_id?: string | null
          content?: string
          created_at?: string
          engine?: string | null
          final_response?: string | null
          id?: string
          original_input?: string | null
          situation?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_response?: string | null
          category?: Database["public"]["Enums"]["learning_category"]
          company_id?: string | null
          content?: string
          created_at?: string
          engine?: string | null
          final_response?: string | null
          id?: string
          original_input?: string | null
          situation?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          company_id: string | null
          contact: string | null
          created_at: string
          id: string
          location: string | null
          notes: string | null
          scheduled_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      my_company: {
        Row: {
          company_name: string | null
          id: string
          industry: string | null
          products_services: string | null
          strengths: string | null
          target_niche: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          id?: string
          industry?: string | null
          products_services?: string | null
          strengths?: string | null
          target_niche?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          id?: string
          industry?: string | null
          products_services?: string | null
          strengths?: string | null
          target_niche?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      note_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          note_id: string
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          note_id: string
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          note_id?: string
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          ai_summary: string | null
          ai_summary_at: string | null
          body: Json
          body_text: string
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["note_entity_type"]
          id: string
          pinned: boolean
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["note_visibility"]
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_at?: string | null
          body?: Json
          body_text?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["note_entity_type"]
          id?: string
          pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Update: {
          ai_summary?: string | null
          ai_summary_at?: string | null
          body?: Json
          body_text?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["note_entity_type"]
          id?: string
          pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Relationships: []
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          cost_price_cents: number | null
          created_at: string
          currency: string
          id: string
          margin_l1_pct: number | null
          margin_l2_pct: number | null
          name: string
          notes: string | null
          part_number: string | null
          selling_price_cents: number | null
          stock_status: string | null
          updated_at: string
          user_id: string
          warranty: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cost_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          margin_l1_pct?: number | null
          margin_l2_pct?: number | null
          name: string
          notes?: string | null
          part_number?: string | null
          selling_price_cents?: number | null
          stock_status?: string | null
          updated_at?: string
          user_id: string
          warranty?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          cost_price_cents?: number | null
          created_at?: string
          currency?: string
          id?: string
          margin_l1_pct?: number | null
          margin_l2_pct?: number | null
          name?: string
          notes?: string | null
          part_number?: string | null
          selling_price_cents?: number | null
          stock_status?: string | null
          updated_at?: string
          user_id?: string
          warranty?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      responses: {
        Row: {
          attachments: Json
          company_id: string | null
          created_at: string
          detected_part_numbers: string[]
          draft: string | null
          engine: string
          final: string | null
          id: string
          input_notes: string | null
          input_text: string
          lead_id: string | null
          ocr_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          company_id?: string | null
          created_at?: string
          detected_part_numbers?: string[]
          draft?: string | null
          engine: string
          final?: string | null
          id?: string
          input_notes?: string | null
          input_text?: string
          lead_id?: string | null
          ocr_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          company_id?: string | null
          created_at?: string
          detected_part_numbers?: string[]
          draft?: string | null
          engine?: string
          final?: string | null
          id?: string
          input_notes?: string | null
          input_text?: string
          lead_id?: string | null
          ocr_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          brand: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          id: string
          invoice_no: string
          model: string | null
          order_date: string | null
          order_ref: string | null
          product: string | null
          rep_javid: number | null
          rep_walid: number | null
          source_sheet: string | null
          user_id: string
          value: number | null
          vat: number | null
        }
        Insert: {
          brand?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          invoice_no: string
          model?: string | null
          order_date?: string | null
          order_ref?: string | null
          product?: string | null
          rep_javid?: number | null
          rep_walid?: number | null
          source_sheet?: string | null
          user_id: string
          value?: number | null
          vat?: number | null
        }
        Update: {
          brand?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          invoice_no?: string
          model?: string | null
          order_date?: string | null
          order_ref?: string | null
          product?: string | null
          rep_javid?: number | null
          rep_walid?: number | null
          source_sheet?: string | null
          user_id?: string
          value?: number | null
          vat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          enabled: boolean
          id: string
          module: string
          tab: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          module: string
          tab?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          id?: string
          module?: string
          tab?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: { _module: string; _tab?: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      activity_type: "note" | "call" | "visit" | "email"
      app_role: "admin" | "manager" | "sales_rep"
      learning_category:
        | "writing_style"
        | "business_rule"
        | "objection"
        | "negotiation"
      note_entity_type: "prospect" | "lead" | "sale" | "meeting" | "standalone"
      note_visibility: "private" | "shared"
      user_status: "active" | "inactive"
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
      activity_type: ["note", "call", "visit", "email"],
      app_role: ["admin", "manager", "sales_rep"],
      learning_category: [
        "writing_style",
        "business_rule",
        "objection",
        "negotiation",
      ],
      note_entity_type: ["prospect", "lead", "sale", "meeting", "standalone"],
      note_visibility: ["private", "shared"],
      user_status: ["active", "inactive"],
    },
  },
} as const
