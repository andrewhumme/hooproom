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
          paused_remaining_ms: number | null
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
          paused_remaining_ms?: number | null
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
          paused_remaining_ms?: number | null
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
      draft_participant_contacts: {
        Row: {
          created_at: string
          owner_email: string | null
          participant_id: string
          room_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          owner_email?: string | null
          participant_id: string
          room_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          owner_email?: string | null
          participant_id?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_participant_contacts_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "draft_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_participant_contacts_room_id_fkey"
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
          share_token: string
          team_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          draft_position?: number | null
          id?: string
          is_bot?: boolean
          joined_at?: string
          room_id: string
          share_token?: string
          team_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          draft_position?: number | null
          id?: string
          is_bot?: boolean
          joined_at?: string
          room_id?: string
          share_token?: string
          team_name?: string
          updated_at?: string
          user_id?: string | null
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
      draft_pick_assignments: {
        Row: {
          created_at: string
          id: string
          pick_number: number
          room_id: string
          team_idx: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pick_number: number
          room_id: string
          team_idx: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pick_number?: number
          room_id?: string
          team_idx?: number
          updated_at?: string
        }
        Relationships: []
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
          was_keeper: boolean
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
          was_keeper?: boolean
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
          was_keeper?: boolean
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
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        Insert: {
          auction_antisnipe_threshold_sec?: number | null
          auction_bid_clock_sec?: number
          auction_budget?: number
          auction_concurrent_per_team?: number
          auction_max_concurrent_nominations?: number
          auction_min_bid?: number
          auction_nominations_per_team?: number | null
          auto_start_at?: string | null
          clock_elapsed_ms?: number
          clock_running?: boolean
          clock_started_at?: string | null
          completed_at?: string | null
          created_at?: string
          current_pick_number?: number
          draft_format?: string
          draft_mode?: string
          host_user_id: string
          id?: string
          keepers_enabled?: boolean
          layout_preference?: string | null
          league_id?: string | null
          name: string
          paused_at?: string | null
          paused_remaining_ms?: number | null
          pick_clock_sec: number
          pick_deadline?: string | null
          player_pool?: string
          reversal_rounds?: number[]
          room_type?: string
          rounds: number
          scheduled_start_at?: string | null
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
          visibility?: string
          warmup_until?: string | null
        }
        Update: {
          auction_antisnipe_threshold_sec?: number | null
          auction_bid_clock_sec?: number
          auction_budget?: number
          auction_concurrent_per_team?: number
          auction_max_concurrent_nominations?: number
          auction_min_bid?: number
          auction_nominations_per_team?: number | null
          auto_start_at?: string | null
          clock_elapsed_ms?: number
          clock_running?: boolean
          clock_started_at?: string | null
          completed_at?: string | null
          created_at?: string
          current_pick_number?: number
          draft_format?: string
          draft_mode?: string
          host_user_id?: string
          id?: string
          keepers_enabled?: boolean
          layout_preference?: string | null
          league_id?: string | null
          name?: string
          paused_at?: string | null
          paused_remaining_ms?: number | null
          pick_clock_sec?: number
          pick_deadline?: string | null
          player_pool?: string
          reversal_rounds?: number[]
          room_type?: string
          rounds?: number
          scheduled_start_at?: string | null
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
          visibility?: string
          warmup_until?: string | null
        }
        Relationships: []
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
      global_player_ranks: {
        Row: {
          created_at: string
          id: string
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          rank: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          player_name: string
          player_position?: string | null
          player_team?: string | null
          rank: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          player_name?: string
          player_position?: string | null
          player_team?: string | null
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_season_snapshots: {
        Row: {
          ast: number | null
          ast_pct: number | null
          blk: number | null
          created_at: string
          ef_fg_pct: number | null
          fg_pct: number | null
          fg3_made: number | null
          fg3_pct: number | null
          ft_pct: number | null
          games_played: number | null
          id: string
          loose_key: string
          minutes_per_game: number | null
          pie: number | null
          player_key: string
          pts: number | null
          reb: number | null
          season: number
          snapshot_date: string
          stl: number | null
          team: string | null
          tov: number | null
          tov_pct: number | null
          ts_pct: number | null
          usg_pct: number | null
        }
        Insert: {
          ast?: number | null
          ast_pct?: number | null
          blk?: number | null
          created_at?: string
          ef_fg_pct?: number | null
          fg_pct?: number | null
          fg3_made?: number | null
          fg3_pct?: number | null
          ft_pct?: number | null
          games_played?: number | null
          id?: string
          loose_key: string
          minutes_per_game?: number | null
          pie?: number | null
          player_key: string
          pts?: number | null
          reb?: number | null
          season: number
          snapshot_date: string
          stl?: number | null
          team?: string | null
          tov?: number | null
          tov_pct?: number | null
          ts_pct?: number | null
          usg_pct?: number | null
        }
        Update: {
          ast?: number | null
          ast_pct?: number | null
          blk?: number | null
          created_at?: string
          ef_fg_pct?: number | null
          fg_pct?: number | null
          fg3_made?: number | null
          fg3_pct?: number | null
          ft_pct?: number | null
          games_played?: number | null
          id?: string
          loose_key?: string
          minutes_per_game?: number | null
          pie?: number | null
          player_key?: string
          pts?: number | null
          reb?: number | null
          season?: number
          snapshot_date?: string
          stl?: number | null
          team?: string | null
          tov?: number | null
          tov_pct?: number | null
          ts_pct?: number | null
          usg_pct?: number | null
        }
        Relationships: []
      }
      player_season_stats: {
        Row: {
          ast: number | null
          ast_pct: number | null
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
          pie: number | null
          player_key: string
          pts: number | null
          reb: number | null
          season: number
          source: string
          stl: number | null
          team: string | null
          tov: number | null
          tov_pct: number | null
          ts_pct: number | null
          updated_at: string
          usg_pct: number | null
        }
        Insert: {
          ast?: number | null
          ast_pct?: number | null
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
          pie?: number | null
          player_key: string
          pts?: number | null
          reb?: number | null
          season: number
          source?: string
          stl?: number | null
          team?: string | null
          tov?: number | null
          tov_pct?: number | null
          ts_pct?: number | null
          updated_at?: string
          usg_pct?: number | null
        }
        Update: {
          ast?: number | null
          ast_pct?: number | null
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
          pie?: number | null
          player_key?: string
          pts?: number | null
          reb?: number | null
          season?: number
          source?: string
          stl?: number | null
          team?: string | null
          tov?: number | null
          tov_pct?: number | null
          ts_pct?: number | null
          updated_at?: string
          usg_pct?: number | null
        }
        Relationships: []
      }
      players: {
        Row: {
          bdl_player_id: number | null
          created_at: string
          draft_number: number | null
          draft_round: number | null
          draft_year: number | null
          first_name: string
          from_year: number | null
          full_name: string
          id: string
          is_active: boolean
          is_rookie: boolean
          last_name: string
          loose_key: string | null
          nba_player_id: number | null
          player_key: string
          position: string | null
          team_abbreviation: string | null
          team_full_name: string | null
          to_year: number | null
          updated_at: string
        }
        Insert: {
          bdl_player_id?: number | null
          created_at?: string
          draft_number?: number | null
          draft_round?: number | null
          draft_year?: number | null
          first_name: string
          from_year?: number | null
          full_name: string
          id?: string
          is_active?: boolean
          is_rookie?: boolean
          last_name: string
          loose_key?: string | null
          nba_player_id?: number | null
          player_key: string
          position?: string | null
          team_abbreviation?: string | null
          team_full_name?: string | null
          to_year?: number | null
          updated_at?: string
        }
        Update: {
          bdl_player_id?: number | null
          created_at?: string
          draft_number?: number | null
          draft_round?: number | null
          draft_year?: number | null
          first_name?: string
          from_year?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_rookie?: boolean
          last_name?: string
          loose_key?: string | null
          nba_player_id?: number | null
          player_key?: string
          position?: string | null
          team_abbreviation?: string | null
          team_full_name?: string | null
          to_year?: number | null
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
      room_keepers: {
        Row: {
          created_at: string
          id: string
          keeper_price: number | null
          keeper_round: number | null
          player_id: string
          player_name: string
          player_position: string | null
          player_team: string | null
          room_id: string
          team_idx: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          keeper_price?: number | null
          keeper_round?: number | null
          player_id: string
          player_name: string
          player_position?: string | null
          player_team?: string | null
          room_id: string
          team_idx: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          keeper_price?: number | null
          keeper_round?: number | null
          player_id?: string
          player_name?: string
          player_position?: string | null
          player_team?: string | null
          room_id?: string
          team_idx?: number
          updated_at?: string
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
      add_bot_seat: {
        Args: { _room_id: string }
        Returns: {
          draft_position: number | null
          id: string
          is_bot: boolean
          joined_at: string
          room_id: string
          share_token: string
          team_name: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          is_admin: boolean
          last_sign_in_at: string
        }[]
      }
      advance_past_keepers: { Args: { _room_id: string }; Returns: undefined }
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
          paused_remaining_ms: number | null
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
          paused_remaining_ms: number | null
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
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
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
      auto_fill_and_start: {
        Args: { _fill_bots?: boolean; _room_id: string }
        Returns: undefined
      }
      can_view_room: { Args: { _room_id: string }; Returns: boolean }
      claim_admin_if_unclaimed: { Args: never; Returns: boolean }
      claim_draft_position: {
        Args: { _new_position: number; _participant_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_stale_guests: { Args: never; Returns: number }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_public_room_participants: {
        Args: { _token: string }
        Returns: {
          draft_position: number
          id: string
          team_name: string
        }[]
      }
      get_public_room_picks: {
        Args: { _token: string }
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
          was_keeper: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "draft_picks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_room_snapshot: {
        Args: { _token: string }
        Returns: {
          current_pick_number: number
          draft_mode: string
          draft_position: number
          participant_id: string
          room_id: string
          room_name: string
          rounds: number
          status: string
          team_count: number
          team_name: string
        }[]
      }
      get_room_id_by_share_token: { Args: { _token: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hoop_z_scores: {
        Args: { _format?: string }
        Returns: {
          loose_key: string
          z: number
        }[]
      }
      host_adjust_clock: {
        Args: { _delta_sec: number; _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      host_force_clock_expire: {
        Args: { _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      host_randomize_positions: {
        Args: { _room_id: string }
        Returns: undefined
      }
      host_replace_pick: {
        Args: {
          _pick_id: string
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
          was_keeper: boolean
        }
        SetofOptions: {
          from: "*"
          to: "draft_picks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      host_room_owner_emails: {
        Args: { _room_id: string }
        Returns: {
          owner_email: string
          participant_id: string
        }[]
      }
      host_set_pick_clock: {
        Args: { _room_id: string; _seconds: number }
        Returns: undefined
      }
      host_start_with_bots: { Args: { _room_id: string }; Returns: undefined }
      host_undo_pick: {
        Args: { _count?: number; _room_id: string }
        Returns: {
          auction_antisnipe_threshold_sec: number | null
          auction_bid_clock_sec: number
          auction_budget: number
          auction_concurrent_per_team: number
          auction_max_concurrent_nominations: number
          auction_min_bid: number
          auction_nominations_per_team: number | null
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_auction_keepers: { Args: { _room_id: string }; Returns: undefined }
      insert_room_keepers: { Args: { _room_id: string }; Returns: undefined }
      keeper_remove: {
        Args: { _player_id: string; _room_id: string }
        Returns: undefined
      }
      keeper_upsert:
        | {
            Args: {
              _keeper_round: number
              _player_id: string
              _player_name: string
              _player_position: string
              _player_team: string
              _room_id: string
              _team_idx: number
            }
            Returns: {
              created_at: string
              id: string
              keeper_price: number | null
              keeper_round: number | null
              player_id: string
              player_name: string
              player_position: string | null
              player_team: string | null
              room_id: string
              team_idx: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "room_keepers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _keeper_price?: number
              _keeper_round: number
              _player_id: string
              _player_name: string
              _player_position: string
              _player_team: string
              _room_id: string
              _team_idx: number
            }
            Returns: {
              created_at: string
              id: string
              keeper_price: number | null
              keeper_round: number | null
              player_id: string
              player_name: string
              player_position: string | null
              player_team: string | null
              room_id: string
              team_idx: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "room_keepers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      lobby_autostart_due: { Args: never; Returns: number }
      make_offline_pick: {
        Args: {
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
          was_keeper: boolean
        }
        SetofOptions: {
          from: "*"
          to: "draft_picks"
          isOneToOne: true
          isSetofReturn: false
        }
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
          was_keeper: boolean
        }
        SetofOptions: {
          from: "*"
          to: "draft_picks"
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
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pick_assignment_reset: {
        Args: { _pick_number: number; _room_id: string }
        Returns: undefined
      }
      pick_assignment_set: {
        Args: { _pick_number: number; _room_id: string; _team_idx: number }
        Returns: {
          created_at: string
          id: string
          pick_number: number
          room_id: string
          team_idx: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "draft_pick_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pick_team_for: {
        Args: {
          _pick_number: number
          _room: Database["public"]["Tables"]["draft_rooms"]["Row"]
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_offline_clock: {
        Args: { _reset?: boolean; _room_id: string; _running: boolean }
        Returns: undefined
      }
      shares_room_with: { Args: { _other_user_id: string }; Returns: boolean }
      snake_autopick_due: { Args: never; Returns: number }
      snake_default_team: {
        Args: {
          _pick_in_round: number
          _room: Database["public"]["Tables"]["draft_rooms"]["Row"]
          _round: number
        }
        Returns: number
      }
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
          auto_start_at: string | null
          clock_elapsed_ms: number
          clock_running: boolean
          clock_started_at: string | null
          completed_at: string | null
          created_at: string
          current_pick_number: number
          draft_format: string
          draft_mode: string
          host_user_id: string
          id: string
          keepers_enabled: boolean
          layout_preference: string | null
          league_id: string | null
          name: string
          paused_at: string | null
          paused_remaining_ms: number | null
          pick_clock_sec: number
          pick_deadline: string | null
          player_pool: string
          reversal_rounds: number[]
          room_type: string
          rounds: number
          scheduled_start_at: string | null
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
          visibility: string
          warmup_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "draft_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_pick_number: {
        Args: {
          _room: Database["public"]["Tables"]["draft_rooms"]["Row"]
          _round: number
          _team_idx: number
        }
        Returns: number
      }
      undo_last_offline_pick: { Args: { _room_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
