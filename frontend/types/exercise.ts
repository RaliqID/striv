export interface MuscleGroup {
  id: number;
  name: string;
  slug: string;
  pivot: {
    is_primary: boolean;
  };
}

export interface Exercise {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  movement_pattern: string | null;
  equipment: string | null;
  muscle_groups: MuscleGroup[];
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page?: number;
  total?: number;
}
