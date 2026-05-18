export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          id: string;
          student_id: string;
          school_id: string | null;
          booking_date: string;
          start_time: string;
          end_time: string;
          memo: string | null;
          status: "確定" | "キャンセル" | "完了";
          is_makeup: boolean;
          absence_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          school_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          memo?: string | null;
          status: "確定" | "キャンセル" | "完了";
          is_makeup?: boolean;
          absence_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          school_id?: string | null;
          booking_date?: string;
          start_time?: string;
          end_time?: string;
          memo?: string | null;
          status?: "確定" | "キャンセル" | "完了";
          is_makeup?: boolean;
          absence_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          }
        ];
      };
      students: {
        Row: {
          id: string;
          school_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          memo: string | null;
          stripe_customer_id: string | null;
          line_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          memo?: string | null;
          stripe_customer_id?: string | null;
          line_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string | null;
          name?: string;
          email?: string | null;
          phone?: string | null;
          memo?: string | null;
          stripe_customer_id?: string | null;
          line_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          }
        ];
      };
      schools: {
        Row: {
          id: string;
          name: string;
          owner_id: string | null;
          billing_day: number;
          owner_line_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id?: string | null;
          billing_day?: number;
          owner_line_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string | null;
          billing_day?: number;
          owner_line_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      school_members: {
        Row: {
          id: string;
          school_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_members_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          school_id: string | null;
          student_id: string | null;
          amount: number;
          currency: string;
          status: string;
          stripe_payment_intent_id: string | null;
          description: string | null;
          due_date: string | null;
          paid_at: string | null;
          charged_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id?: string | null;
          student_id?: string | null;
          amount: number;
          currency?: string;
          status?: string;
          stripe_payment_intent_id?: string | null;
          description?: string | null;
          due_date?: string | null;
          paid_at?: string | null;
          charged_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string | null;
          student_id?: string | null;
          amount?: number;
          currency?: string;
          status?: string;
          stripe_payment_intent_id?: string | null;
          description?: string | null;
          due_date?: string | null;
          paid_at?: string | null;
          charged_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          }
        ];
      };
      payment_settings: {
        Row: {
          id: string;
          school_id: string | null;
          student_id: string | null;
          billing_type: string;
          amount: number;
          billing_day: number;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id?: string | null;
          student_id?: string | null;
          billing_type?: string;
          amount: number;
          billing_day?: number;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string | null;
          student_id?: string | null;
          billing_type?: string;
          amount?: number;
          billing_day?: number;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_settings_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_settings_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          }
        ];
      };
      teacher_availability: {
        Row: {
          id: string;
          school_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          lesson_duration_minutes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          lesson_duration_minutes?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          lesson_duration_minutes?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      school_closed_days: {
        Row: {
          id: string;
          school_id: string;
          closed_date: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          closed_date: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          closed_date?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      absences: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          original_booking_id: string | null;
          absence_date: string;
          reason: string | null;
          makeup_booking_id: string | null;
          status: "pending" | "scheduled" | "cancelled";
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          original_booking_id?: string | null;
          absence_date: string;
          reason?: string | null;
          makeup_booking_id?: string | null;
          status?: "pending" | "scheduled" | "cancelled";
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          original_booking_id?: string | null;
          absence_date?: string;
          reason?: string | null;
          makeup_booking_id?: string | null;
          status?: "pending" | "scheduled" | "cancelled";
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      invite_school_member: {
        Args: { p_school_id: string; p_email: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
