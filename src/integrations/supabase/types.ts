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
          attendance_id: string | null
          burial_location: string | null
          burial_time: string | null
          created_at: string
          deceased_name: string | null
          destination: string | null
          end_time: string | null
          event_date: string
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
          service: string | null
          start_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agenda_type: string
          attendance_id?: string | null
          burial_location?: string | null
          burial_time?: string | null
          created_at?: string
          deceased_name?: string | null
          destination?: string | null
          end_time?: string | null
          event_date: string
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
          service?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agenda_type?: string
          attendance_id?: string | null
          burial_location?: string | null
          burial_time?: string | null
          created_at?: string
          deceased_name?: string | null
          destination?: string | null
          end_time?: string | null
          event_date?: string
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
          service?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
