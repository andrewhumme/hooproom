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
      draft_participants: {
        Row: {
          draft_position: number | null
          id: string
          joined_at: string
          room_id: string
          team_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          draft_position?: number | null
          id?: string
          joined_at?: string
          room_id: string
          team_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          draft_position?: number | null
          id?: string
          joined_at?: string
          room_id?: string
          team_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          id: string
          pick_number: number
          picked_at: string
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          room_id: string
          round: number
          team_idx: number
          user_id: string | null
          was_autopick: boolean
        }
        Insert: {
          id?: string
          pick_number: number
          picked_at?: string
          player_id: string
          player_name: string
          player_position?: string | null
          player_team?: string | null
          room_id: string
          round: number
          team_idx: number
          user_id?: string | null
          was_autopick?: boolean
        }
        Update: {
          id?: string
          pick_number?: number
          picked_at?: string
          player_id?: string
          player_name?: string
          player_position?: string | null
          player_team?: string | null
          room_id?: string
          round?: number
          team_idx?: number
          user_id?: string | null
          was_autopick?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_rooms: {
        Row: {
          completed_at: string | null
          created_at: string
          current_pick_number: number
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          pick_clock_sec: number
          pick_deadline: string | null
          rounds: number
          scoring_format: string
          started_at: string | null
          status: string
          team_count: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_pick_number?: number
          host_user_id: string
          id?: string
          league_id?: string | null
          name: string
          pick_clock_sec: number
          pick_deadline?: string | null
          rounds: number
          scoring_format?: string
          started_at?: string | null
          status?: string
          team_count: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_pick_number?: number
          host_user_id?: string
          id?: string
          league_id?: string | null
          name?: string
          pick_clock_sec?: number
          pick_deadline?: string | null
          rounds?: number
          scoring_format?: string
          started_at?: string | null
          status?: string
          team_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          bdl_player_id: number | null
          created_at: string
          first_name: string
          full_name: string
          id: string
          is_active: boolean
          last_name: string
          nba_player_id: number | null
          player_key: string
          position: string | null
          team_abbreviation: string | null
          team_full_name: string | null
          updated_at: string
        }
        Insert: {
          bdl_player_id?: number | null
          created_at?: string
          first_name: string
          full_name: string
          id?: string
          is_active?: boolean
          last_name: string
          nba_player_id?: number | null
          player_key: string
          position?: string | null
          team_abbreviation?: string | null
          team_full_name?: string | null
          updated_at?: string
        }
        Update: {
          bdl_player_id?: number | null
          created_at?: string
          first_name?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          nba_player_id?: number | null
          player_key?: string
          position?: string | null
          team_abbreviation?: string | null
          team_full_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
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
      make_pick: {
        Args: {
          _autopick?: boolean
          _player_id: string
          _player_name: string
          _player_position: string
          _player_team: string
          _room_id: string
        }
        Returns: {
          id: string
          pick_number: number
          picked_at: string
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          room_id: string
          round: number
          team_idx: number
          user_id: string | null
          was_autopick: boolean
        }
        SetofOptions: {
          from: "*"
          to: "draft_picks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_draft: {
        Args: { _room_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          current_pick_number: number
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          pick_clock_sec: number
          pick_deadline: string | null
          rounds: number
          scoring_format: string
          started_at: string | null
          status: string
          team_count: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
