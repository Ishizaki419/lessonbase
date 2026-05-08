export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          id: string;
          student_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          memo: string | null;
          status: "確定" | "キャンセル" | "完了";
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          memo?: string | null;
          status: "確定" | "キャンセル" | "完了";
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          booking_date?: string;
          start_time?: string;
          end_time?: string;
          memo?: string | null;
          status?: "確定" | "キャンセル" | "完了";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          }
        ];
      };
      students: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
