// Dropdown option sets for the vehicle / report forms. Kept small and UAE-relevant.

export const REGIONAL_SPECS = ['GCC', 'American', 'Import', 'Unknown'] as const
export const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT', 'Dual-Clutch'] as const
export const FUEL_TYPES = ['Petrol', 'Diesel', 'Hybrid', 'Electric'] as const

export const EMIRATES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
  'Al Ain',
] as const

export const VEHICLE_PLACEHOLDERS = {
  make: 'Toyota',
  model: 'Land Cruiser',
  year: '2021',
  vin: 'JTXXXXXXXXXXXXXXX',
  plate: 'Dubai A 12345',
  odometer: '82,000 km',
  regional_specs: 'GCC',
  fuel: 'Petrol',
  transmission: 'Automatic',
  engine: '3.5L V6',
  colour: 'White',
  location: 'Dubai',
} as const
