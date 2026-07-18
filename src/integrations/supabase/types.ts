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
      agenda_events: {
        Row: {
          agenda_type: string
          arrival_time: string | null
          attendance_id: string | null
          burial_location: string | null
          burial_time: string | null
          created_at: string
          deceased_name: string | null
          destination: string | null
          driver_name: string | null
          end_time: string | null
          event_date: string
          family_present: boolean | null
          funeral_home: string | null
          gaveta: string | null
          id: string
          location: string | null
          notes: string | null
          payment_date: string | null
          pss_reference: string | null
          quadra_rua: string | null
          registration_number: string | null
          responsible_name: string | null
          result_status: string | null
          room: string | null
          service: string | null
          start_time: string | null
          status: string
          terreno: string | null
          updated_at: string
          user_id: string
          vehicle_plate: string | null
        }
        Insert: {
          agenda_type: string
          arrival_time?: string | null
          attendance_id?: string | null
          burial_location?: string | null
          burial_time?: string | null
          created_at?: string
          deceased_name?: string | null
          destination?: string | null
          driver_name?: string | null
          end_time?: string | null
          event_date: string
          family_present?: boolean | null
          funeral_home?: string | null
          gaveta?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          payment_date?: string | null
          pss_reference?: string | null
          quadra_rua?: string | null
          registration_number?: string | null
          responsible_name?: string | null
          result_status?: string | null
          room?: string | null
          service?: string | null
          start_time?: string | null
          status?: string
          terreno?: string | null
          updated_at?: string
          user_id: string
          vehicle_plate?: string | null
        }
        Update: {
          agenda_type?: string
          arrival_time?: string | null
          attendance_id?: string | null
          burial_location?: string | null
          burial_time?: string | null
          created_at?: string
          deceased_name?: string | null
          destination?: string | null
          driver_name?: string | null
          end_time?: string | null
          event_date?: string
          family_present?: boolean | null
          funeral_home?: string | null
          gaveta?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          payment_date?: string | null
          pss_reference?: string | null
          quadra_rua?: string | null
          registration_number?: string | null
          responsible_name?: string | null
          result_status?: string | null
          room?: string | null
          service?: string | null
          start_time?: string | null
          status?: string
          terreno?: string | null
          updated_at?: string
          user_id?: string
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_events_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_images: {
        Row: {
          attendance_id: string
          created_at: string
          id: string
          mime_type: string | null
          original_name: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          attendance_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          original_name?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          attendance_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          original_name?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_images_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          created_at: string
          extracted_data: Json
          id: string
          notes: string | null
          process: string
          status: string
          subprocess: string | null
          subprocess_details: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_data?: Json
          id?: string
          notes?: string | null
          process: string
          status?: string
          subprocess?: string | null
          subprocess_details?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_data?: Json
          id?: string
          notes?: string | null
          process?: string
          status?: string
          subprocess?: string | null
          subprocess_details?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          placeholders: string[]
          process: string | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          placeholders?: string[]
          process?: string | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          placeholders?: string[]
          process?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exhumation_appointments: {
        Row: {
          attendance_id: string | null
          created_at: string
          deceased_name: string | null
          destination: string | null
          event_date: string
          exhumation_phase: string
          family_present: boolean | null
          funeral_home: string | null
          id: string
          location: string | null
          notes: string | null
          payment_date: string | null
          pss_reference: string | null
          registration_number: string | null
          responsible_name: string | null
          result_status: string | null
          room: string | null
          status: string
          time_slot: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_id?: string | null
          created_at?: string
          deceased_name?: string | null
          destination?: string | null
          event_date: string
          exhumation_phase: string
          family_present?: boolean | null
          funeral_home?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          payment_date?: string | null
          pss_reference?: string | null
          registration_number?: string | null
          responsible_name?: string | null
          result_status?: string | null
          room?: string | null
          status?: string
          time_slot: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_id?: string | null
          created_at?: string
          deceased_name?: string | null
          destination?: string | null
          event_date?: string
          exhumation_phase?: string
          family_present?: boolean | null
          funeral_home?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          payment_date?: string | null
          pss_reference?: string | null
          registration_number?: string | null
          responsible_name?: string | null
          result_status?: string | null
          room?: string | null
          status?: string
          time_slot?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exhumation_appointments_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      funeral_audit_log: {
        Row: {
          acao: string
          created_at: string
          id: string
          payload: Json
          process_id: string | null
          user_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          id?: string
          payload?: Json
          process_id?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          id?: string
          payload?: Json
          process_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funeral_audit_log_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "funeral_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      funeral_deceased: {
        Row: {
          created_at: string
          dados: Json
          id: string
          papel: string
          process_id: string
        }
        Insert: {
          created_at?: string
          dados?: Json
          id?: string
          papel?: string
          process_id: string
        }
        Update: {
          created_at?: string
          dados?: Json
          id?: string
          papel?: string
          process_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funeral_deceased_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "funeral_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      funeral_discrepancies: {
        Row: {
          campo: string
          confianca: number
          created_at: string
          doc_a_id: string | null
          doc_b_id: string | null
          id: string
          process_id: string
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          sugestao: string | null
          valor_a: string | null
          valor_b: string | null
          valor_final: string | null
        }
        Insert: {
          campo: string
          confianca?: number
          created_at?: string
          doc_a_id?: string | null
          doc_b_id?: string | null
          id?: string
          process_id: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          sugestao?: string | null
          valor_a?: string | null
          valor_b?: string | null
          valor_final?: string | null
        }
        Update: {
          campo?: string
          confianca?: number
          created_at?: string
          doc_a_id?: string | null
          doc_b_id?: string | null
          id?: string
          process_id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          sugestao?: string | null
          valor_a?: string | null
          valor_b?: string | null
          valor_final?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funeral_discrepancies_doc_a_id_fkey"
            columns: ["doc_a_id"]
            isOneToOne: false
            referencedRelation: "funeral_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funeral_discrepancies_doc_b_id_fkey"
            columns: ["doc_b_id"]
            isOneToOne: false
            referencedRelation: "funeral_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funeral_discrepancies_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "funeral_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      funeral_documents: {
        Row: {
          attendance_image_id: string | null
          classificacao_confianca: number
          created_at: string
          dados_extraidos: Json
          id: string
          process_id: string
          tipo_documento: string
        }
        Insert: {
          attendance_image_id?: string | null
          classificacao_confianca?: number
          created_at?: string
          dados_extraidos?: Json
          id?: string
          process_id: string
          tipo_documento: string
        }
        Update: {
          attendance_image_id?: string | null
          classificacao_confianca?: number
          created_at?: string
          dados_extraidos?: Json
          id?: string
          process_id?: string
          tipo_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "funeral_documents_attendance_image_id_fkey"
            columns: ["attendance_image_id"]
            isOneToOne: false
            referencedRelation: "attendance_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funeral_documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "funeral_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      funeral_field_feedback: {
        Row: {
          campo: string
          coordenadas: Json | null
          created_at: string
          id: string
          modelo: string | null
          process_id: string | null
          tipo_documento: string
          user_id: string
          valor_correto: string
          valor_extraido: string | null
        }
        Insert: {
          campo: string
          coordenadas?: Json | null
          created_at?: string
          id?: string
          modelo?: string | null
          process_id?: string | null
          tipo_documento: string
          user_id: string
          valor_correto: string
          valor_extraido?: string | null
        }
        Update: {
          campo?: string
          coordenadas?: Json | null
          created_at?: string
          id?: string
          modelo?: string | null
          process_id?: string | null
          tipo_documento?: string
          user_id?: string
          valor_correto?: string
          valor_extraido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funeral_field_feedback_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "funeral_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      funeral_processes: {
        Row: {
          attendance_id: string | null
          created_at: string
          dados: Json
          id: string
          status: string
          tipo_processo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_id?: string | null
          created_at?: string
          dados?: Json
          id?: string
          status?: string
          tipo_processo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_id?: string | null
          created_at?: string
          dados?: Json
          id?: string
          status?: string
          tipo_processo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funeral_processes_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          attendance_id: string
          created_at: string
          id: string
          name: string
          storage_path: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          attendance_id: string
          created_at?: string
          id?: string
          name: string
          storage_path: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          attendance_id?: string
          created_at?: string
          id?: string
          name?: string
          storage_path?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
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
  public: {
    Enums: {},
  },
} as const
