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
      auction_bids: {
        Row: {
          amount: number
          bid_at: string
          id: string
          is_opening: boolean
          nomination_id: string
          room_id: string
          team_idx: number
          user_id: string | null
        }
        Insert: {
          amount: number
          bid_at?: string
          id?: string
          is_opening?: boolean
          nomination_id: string
          room_id: string
          team_idx: number
          user_id?: string | null
        }
        Update: {
          amount?: number
          bid_at?: string
          id?: string
          is_opening?: boolean
          nomination_id?: string
          room_id?: string
          team_idx?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_nomination_id_fkey"
            columns: ["nomination_id"]
            isOneToOne: false
            referencedRelation: "auction_nominations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_nominations: {
        Row: {
          awarded_at: string | null
          created_at: string
          current_bid: number
          current_bidder_team_idx: number
          current_bidder_user_id: string | null
          deadline: string
          id: string
          nomination_number: number
          nominator_team_idx: number
          opening_bid: number
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          room_id: string
          status: string
        }
        Insert: {
          awarded_at?: string | null
          created_at?: string
          current_bid: number
          current_bidder_team_idx: number
          current_bidder_user_id?: string | null
          deadline: string
          id?: string
          nomination_number: number
          nominator_team_idx: number
          opening_bid: number
          player_id: string
          player_name: string
          player_position?: string | null
          player_team?: string | null
          room_id: string
          status?: string
        }
        Update: {
          awarded_at?: string | null
          created_at?: string
          current_bid?: number
          current_bidder_team_idx?: number
          current_bidder_user_id?: string | null
          deadline?: string
          id?: string
          nomination_number?: number
          nominator_team_idx?: number
          opening_bid?: number
          player_id?: string
          player_name?: string
          player_position?: string | null
          player_team?: string | null
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_nominations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_participants: {
        Row: {
          draft_position: number | null
          id: string
          is_bot: boolean
          joined_at: string
          room_id: string
          team_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          draft_position?: number | null
          id?: string
          is_bot?: boolean
          joined_at?: string
          room_id: string
          team_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          draft_position?: number | null
          id?: string
          is_bot?: boolean
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
          auction_price: number | null
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
          auction_price?: number | null
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
          auction_price?: number | null
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
      draft_queues: {
        Row: {
          created_at: string
          id: string
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          rank: number
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          player_name: string
          player_position?: string | null
          player_team?: string | null
          rank: number
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          player_name?: string
          player_position?: string | null
          player_team?: string | null
          rank?: number
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      draft_rooms: {
        Row: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          paused_at: string | null
          pick_clock_sec: number
          pick_deadline: string | null
          reversal_rounds: number[]
          rounds: number
          scoring_format: string
          slots_bn: number
          slots_c: number
          slots_f: number
          slots_flx: number
          slots_g: number
          slots_pf: number
          slots_pg: number
          slots_sf: number
          slots_sg: number
          started_at: string | null
          status: string
          team_count: number
          updated_at: string
        }
        Insert: {
          auction_antisnipe_threshold_sec?: number | null
          auction_bid_clock_sec?: number
          auction_budget?: number
          auction_concurrent_per_team?: number
          auction_max_concurrent_nominations?: number
          auction_min_bid?: number
          auction_nominations_per_team?: number | null
          completed_at?: string | null
          created_at?: string
          current_pick_number?: number
          draft_format?: string
          host_user_id: string
          id?: string
          league_id?: string | null
          name: string
          paused_at?: string | null
          pick_clock_sec: number
          pick_deadline?: string | null
          reversal_rounds?: number[]
          rounds: number
          scoring_format?: string
          slots_bn?: number
          slots_c?: number
          slots_f?: number
          slots_flx?: number
          slots_g?: number
          slots_pf?: number
          slots_pg?: number
          slots_sf?: number
          slots_sg?: number
          started_at?: string | null
          status?: string
          team_count: number
          updated_at?: string
        }
        Update: {
          auction_antisnipe_threshold_sec?: number | null
          auction_bid_clock_sec?: number
          auction_budget?: number
          auction_concurrent_per_team?: number
          auction_max_concurrent_nominations?: number
          auction_min_bid?: number
          auction_nominations_per_team?: number | null
          completed_at?: string | null
          created_at?: string
          current_pick_number?: number
          draft_format?: string
          host_user_id?: string
          id?: string
          league_id?: string | null
          name?: string
          paused_at?: string | null
          pick_clock_sec?: number
          pick_deadline?: string | null
          reversal_rounds?: number[]
          rounds?: number
          scoring_format?: string
          slots_bn?: number
          slots_c?: number
          slots_f?: number
          slots_flx?: number
          slots_g?: number
          slots_pf?: number
          slots_pg?: number
          slots_sf?: number
          slots_sg?: number
          started_at?: string | null
          status?: string
          team_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_season_stats: {
        Row: {
          ast: number | null
          blk: number | null
          created_at: string
          dreb: number | null
          ef_fg_pct: number | null
          fg_att: number | null
          fg_made: number | null
          fg_pct: number | null
          fg3_att: number | null
          fg3_made: number | null
          fg3_pct: number | null
          ft_att: number | null
          ft_made: number | null
          ft_pct: number | null
          games_played: number | null
          games_started: number | null
          id: string
          loose_key: string | null
          minutes_per_game: number | null
          oreb: number | null
          player_key: string
          pts: number | null
          reb: number | null
          season: number
          source: string
          stl: number | null
          team: string | null
          tov: number | null
          updated_at: string
        }
        Insert: {
          ast?: number | null
          blk?: number | null
          created_at?: string
          dreb?: number | null
          ef_fg_pct?: number | null
          fg_att?: number | null
          fg_made?: number | null
          fg_pct?: number | null
          fg3_att?: number | null
          fg3_made?: number | null
          fg3_pct?: number | null
          ft_att?: number | null
          ft_made?: number | null
          ft_pct?: number | null
          games_played?: number | null
          games_started?: number | null
          id?: string
          loose_key?: string | null
          minutes_per_game?: number | null
          oreb?: number | null
          player_key: string
          pts?: number | null
          reb?: number | null
          season: number
          source?: string
          stl?: number | null
          team?: string | null
          tov?: number | null
          updated_at?: string
        }
        Update: {
          ast?: number | null
          blk?: number | null
          created_at?: string
          dreb?: number | null
          ef_fg_pct?: number | null
          fg_att?: number | null
          fg_made?: number | null
          fg_pct?: number | null
          fg3_att?: number | null
          fg3_made?: number | null
          fg3_pct?: number | null
          ft_att?: number | null
          ft_made?: number | null
          ft_pct?: number | null
          games_played?: number | null
          games_started?: number | null
          id?: string
          loose_key?: string | null
          minutes_per_game?: number | null
          oreb?: number | null
          player_key?: string
          pts?: number | null
          reb?: number | null
          season?: number
          source?: string
          stl?: number | null
          team?: string | null
          tov?: number | null
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
          loose_key: string | null
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
          loose_key?: string | null
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
          loose_key?: string | null
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
      add_bot_seat: {
        Args: { _room_id: string }
        Returns: {
          draft_position: number | null
          id: string
          is_bot: boolean
          joined_at: string
          room_id: string
          team_name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "draft_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auction_award_due: { Args: { _room_id?: string }; Returns: number }
      auction_bid: {
        Args: { _amount: number; _nomination_id: string }
        Returns: {
          awarded_at: string | null
          created_at: string
          current_bid: number
          current_bidder_team_idx: number
          current_bidder_user_id: string | null
          deadline: string
          id: string
          nomination_number: number
          nominator_team_idx: number
          opening_bid: number
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          room_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "auction_nominations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auction_bot_bid_due: { Args: never; Returns: number }
      auction_bot_nominate_due: { Args: never; Returns: number }
      auction_next_nominator: { Args: { _room_id: string }; Returns: number }
      auction_nominate: {
        Args: {
          _opening_bid: number
          _player_id: string
          _player_name: string
          _player_position: string
          _player_team: string
          _room_id: string
        }
        Returns: {
          awarded_at: string | null
          created_at: string
          current_bid: number
          current_bidder_team_idx: number
          current_bidder_user_id: string | null
          deadline: string
          id: string
          nomination_number: number
          nominator_team_idx: number
          opening_bid: number
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          room_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "auction_nominations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auction_start: {
        Args: { _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          paused_at: string | null
          pick_clock_sec: number
          pick_deadline: string | null
          reversal_rounds: number[]
          rounds: number
          scoring_format: string
          slots_bn: number
          slots_c: number
          slots_f: number
          slots_flx: number
          slots_g: number
          slots_pf: number
          slots_pg: number
          slots_sf: number
          slots_sg: number
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
      auction_total_slots: {
        Args: { _room: Database["public"]["Tables"]["draft_rooms"]["Row"] }
        Returns: number
      }
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
          auction_price: number | null
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
      pause_draft: {
        Args: { _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          paused_at: string | null
          pick_clock_sec: number
          pick_deadline: string | null
          reversal_rounds: number[]
          rounds: number
          scoring_format: string
          slots_bn: number
          slots_c: number
          slots_f: number
          slots_flx: number
          slots_g: number
          slots_pf: number
          slots_pg: number
          slots_sf: number
          slots_sg: number
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
      remove_bot_seat: { Args: { _participant_id: string }; Returns: undefined }
      resume_draft: {
        Args: { _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          paused_at: string | null
          pick_clock_sec: number
          pick_deadline: string | null
          reversal_rounds: number[]
          rounds: number
          scoring_format: string
          slots_bn: number
          slots_c: number
          slots_f: number
          slots_flx: number
          slots_g: number
          slots_pf: number
          slots_pg: number
          slots_sf: number
          slots_sg: number
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
      snake_autopick_due: { Args: never; Returns: number }
      start_draft: {
        Args: { _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          host_user_id: string
          id: string
          league_id: string | null
          name: string
          paused_at: string | null
          pick_clock_sec: number
          pick_deadline: string | null
          reversal_rounds: number[]
          rounds: number
          scoring_format: string
          slots_bn: number
          slots_c: number
          slots_f: number
          slots_flx: number
          slots_g: number
          slots_pf: number
          slots_pg: number
          slots_sf: number
          slots_sg: number
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
