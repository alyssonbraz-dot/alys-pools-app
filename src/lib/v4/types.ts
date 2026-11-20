export type Reading = { ph: number; fc: number; alkalinity: number | null };

export type WaterBody = {
  id: string;
  name: string;
  kind: 'pool' | 'spa';
  gallons: number | null;
  equipment: string[];
  history: (Reading & {date: string})[];
};

export type BodyService = Reading & {
  bodyId: string;
  chemicals: { product: string; amount: number; unit: string }[];
  tasks: string[];
};

export type VisitInput = {
  id: string;
  stopId: string;
  date: string;
  bodies: BodyService[];
  notes: string;
};

export type Stop = {
  id: string;
  name: string;
  address: string;
  position: number;
  latitude: number | null;
  longitude: number | null;
  bodies: WaterBody[];
  completedAt: string | null;
  visit: VisitInput | null;
};

export type RouteDay = { date: string; technician: string; stops: Stop[] };
