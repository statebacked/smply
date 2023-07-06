export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      current_machine_versions: {
        Row: {
          machine_id: string;
          machine_version_id: string;
        };
        Insert: {
          machine_id: string;
          machine_version_id: string;
        };
        Update: {
          machine_id?: string;
          machine_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "current_machine_versions_machine_id_fkey";
            columns: ["machine_id"];
            referencedRelation: "machines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "current_machine_versions_machine_version_id_fkey";
            columns: ["machine_version_id"];
            referencedRelation: "machine_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "current_machine_versions_machine_version_id_fkey";
            columns: ["machine_version_id"];
            referencedRelation: "machine_instance_states";
            referencedColumns: ["machine_version_id"];
          },
          {
            foreignKeyName: "current_machine_versions_machine_version_id_fkey";
            columns: ["machine_version_id"];
            referencedRelation: "machine_instance_transitions";
            referencedColumns: ["machine_version_id"];
          },
        ];
      };
      keys: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string | null;
          scope: Database["public"]["Enums"]["scope"][] | null;
          shared_secret_id: string;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id?: string | null;
          scope?: Database["public"]["Enums"]["scope"][] | null;
          shared_secret_id: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string | null;
          scope?: Database["public"]["Enums"]["scope"][] | null;
          shared_secret_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "keys_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keys_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keys_shared_secret_id_fkey";
            columns: ["shared_secret_id"];
            referencedRelation: "secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keys_shared_secret_id_fkey";
            columns: ["shared_secret_id"];
            referencedRelation: "decrypted_secrets";
            referencedColumns: ["id"];
          },
        ];
      };
      machine_instance_state: {
        Row: {
          latest_machine_transition_id: string | null;
          machine_instance_id: string;
        };
        Insert: {
          latest_machine_transition_id?: string | null;
          machine_instance_id: string;
        };
        Update: {
          latest_machine_transition_id?: string | null;
          machine_instance_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "machine_instance_state_latest_machine_transition_id_fkey";
            columns: ["latest_machine_transition_id"];
            referencedRelation: "machine_transitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "machine_instance_state_machine_instance_id_fkey";
            columns: ["machine_instance_id"];
            referencedRelation: "machine_instances";
            referencedColumns: ["id"];
          },
        ];
      };
      machine_instances: {
        Row: {
          created_at: string;
          extended_slug: string;
          id: string;
          machine_version_id: string;
        };
        Insert: {
          created_at?: string;
          extended_slug: string;
          id?: string;
          machine_version_id: string;
        };
        Update: {
          created_at?: string;
          extended_slug?: string;
          id?: string;
          machine_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "machine_instances_machine_version_id_fkey";
            columns: ["machine_version_id"];
            referencedRelation: "machine_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "machine_instances_machine_version_id_fkey";
            columns: ["machine_version_id"];
            referencedRelation: "machine_instance_states";
            referencedColumns: ["machine_version_id"];
          },
          {
            foreignKeyName: "machine_instances_machine_version_id_fkey";
            columns: ["machine_version_id"];
            referencedRelation: "machine_instance_transitions";
            referencedColumns: ["machine_version_id"];
          },
        ];
      };
      machine_transitions: {
        Row: {
          created_at: string;
          id: string;
          machine_instance_id: string;
          state: Json;
        };
        Insert: {
          created_at?: string;
          id?: string;
          machine_instance_id: string;
          state: Json;
        };
        Update: {
          created_at?: string;
          id?: string;
          machine_instance_id?: string;
          state?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "machine_transitions_machine_instance_id_fkey";
            columns: ["machine_instance_id"];
            referencedRelation: "machine_instances";
            referencedColumns: ["id"];
          },
        ];
      };
      machine_versions: {
        Row: {
          client_info: string | null;
          created_at: string | null;
          id: string;
          machine_id: string;
        };
        Insert: {
          client_info?: string | null;
          created_at?: string | null;
          id?: string;
          machine_id: string;
        };
        Update: {
          client_info?: string | null;
          created_at?: string | null;
          id?: string;
          machine_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "machine_versions_machine_id_fkey";
            columns: ["machine_id"];
            referencedRelation: "machines";
            referencedColumns: ["id"];
          },
        ];
      };
      machines: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          org_id: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "machines_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "machines_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invitations: {
        Row: {
          created_at: string | null;
          created_by: string;
          email: string;
          id: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
        };
        Insert: {
          created_at?: string | null;
          created_by: string;
          email: string;
          id?: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
        };
        Update: {
          created_at?: string | null;
          created_by?: string;
          email?: string;
          id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
        };
        Relationships: [
          {
            foreignKeyName: "org_invitations_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      org_limits: {
        Row: {
          created_at: string;
          monthly_events_limit: number;
          monthly_reads_limit: number;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          monthly_events_limit: number;
          monthly_reads_limit: number;
          org_id: string;
        };
        Update: {
          created_at?: string;
          monthly_events_limit?: number;
          monthly_reads_limit?: number;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_limits_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      org_members: {
        Row: {
          created_at: string | null;
          created_by: string;
          id: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          created_by: string;
          id?: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string;
          id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      orgs: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orgs_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      queue: {
        Row: {
          created_at: string | null;
          event: Json;
          event_id: string;
          id: string;
          machine_instance_id: string;
          release_at: string | null;
          run_at: string;
          status: Database["public"]["Enums"]["queue_item_status"];
        };
        Insert: {
          created_at?: string | null;
          event: Json;
          event_id: string;
          id?: string;
          machine_instance_id: string;
          release_at?: string | null;
          run_at: string;
          status: Database["public"]["Enums"]["queue_item_status"];
        };
        Update: {
          created_at?: string | null;
          event?: Json;
          event_id?: string;
          id?: string;
          machine_instance_id?: string;
          release_at?: string | null;
          run_at?: string;
          status?: Database["public"]["Enums"]["queue_item_status"];
        };
        Relationships: [
          {
            foreignKeyName: "queue_machine_instance_id_fkey";
            columns: ["machine_instance_id"];
            referencedRelation: "machine_instances";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_customers: {
        Row: {
          created_at: string | null;
          org_id: string;
          stripe_customer_id: string;
        };
        Insert: {
          created_at?: string | null;
          org_id: string;
          stripe_customer_id: string;
        };
        Update: {
          created_at?: string | null;
          org_id?: string;
          stripe_customer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stripe_customers_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          billing_address: Json | null;
          full_name: string | null;
          id: string;
          payment_method: Json | null;
        };
        Insert: {
          avatar_url?: string | null;
          billing_address?: Json | null;
          full_name?: string | null;
          id: string;
          payment_method?: Json | null;
        };
        Update: {
          avatar_url?: string | null;
          billing_address?: Json | null;
          full_name?: string | null;
          id?: string;
          payment_method?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "users_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      my_admin_memberships: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          id: string | null;
          org_id: string | null;
          role: Database["public"]["Enums"]["org_role"] | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string | null;
          org_id?: string | null;
          role?: Database["public"]["Enums"]["org_role"] | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string | null;
          org_id?: string | null;
          role?: Database["public"]["Enums"]["org_role"] | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      gen_ulid: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      org_role: "admin" | "write" | "read";
      queue_item_status: "running" | "waiting";
      scope:
        | "events.write"
        | "events.read"
        | "state.read"
        | "instances.read"
        | "instances.write"
        | "machines.read"
        | "machines.write"
        | "machine-versions.read"
        | "machine-versions.write"
        | "analytics.read"
        | "org-members.write"
        | "org.keys.write";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
