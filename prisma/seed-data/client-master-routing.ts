export type ClientMasterDayFilter = "Weekdays" | "Weekend";

export type ClientMasterRoutingSeedRecord = {
  clientName: string;
  region: string;
  dayFilter: ClientMasterDayFilter;
  status: "Active" | "Inactive";
  to: readonly string[];
  cc: readonly string[];
};

/**
 * Governed bootstrap extracted from:
 * ModifByRF-FCTG-Master Data Template - PH Notifications(1).xlsx / Client_Master
 *
 * User-confirmed migration decision:
 * - every non-sample Client Name is a canonical Client
 * - source has no separate Service Team column
 * - a same-name ServiceTeam compatibility projection is created so the current
 *   ClientSubscription model can preserve Region + recipients without inventing
 *   a business-team label that is not present in the source
 * - Client PIC Email becomes TO recipients
 * - CC becomes CC recipients
 * - SAMPLE / xxx rows are excluded
 *
 * dayFilter is retained as migration evidence until NotificationPolicy persists
 * the legacy Weekdays/Weekend behavior.
 */
export const CLIENT_MASTER_ROUTING_SEED = {
  sourceWorkbook:
    "ModifByRF-FCTG-Master Data Template - PH Notifications(1).xlsx",
  sourceSheet: "Client_Master",
  excludedSampleRows: 6,
  records: [
  {
    "clientName": "Ticketing AU",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ferwinda.jansen@dummy.com",
      "gatirdo_saragih@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing NZ",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ferwinda.jansen@dummy.com",
      "gatirdo_saragih@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing Independent AU",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ilham_yunizar@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing UK",
    "region": "United Kingdom",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "yovita_mulyo@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing RSA",
    "region": "South Africa",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "yovita_mulyo@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing NA",
    "region": "North America",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ilham_yunizar@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing NA ACS",
    "region": "North America",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ilham_yunizar@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Refund AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "chrestella.benedicta@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Refund Global",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "chrestella.benedicta@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.com.au",
      "elisa_sulistio@dummy.com"
    ]
  },
  {
    "clientName": "Helio Support",
    "region": "Indonesia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "naviri.fidinna@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "Prohub Support",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "naviri.fidinna@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "Prohub Support Independent",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "UK Land",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "Profile Support",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "Product Delivery",
    "region": "Indonesia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "Content Creation",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.com"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.com.au",
      "lucia_fredricka@dummy.com"
    ]
  },
  {
    "clientName": "Supply FinOps",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "prawiratama_putra@dummy.com"
    ],
    "cc": [
      "viery.pradipta@ignitetravel.com",
      "marcel.yonathan@ignitetravel.com"
    ]
  },
  {
    "clientName": "Ignite Finance",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "marcel.yonathan@ignitetravel.com"
    ],
    "cc": [
      "viery.pradipta@ignitetravel.com",
      "prawiratama_putra@dummy.com"
    ]
  },
  {
    "clientName": "CF - Account Payable AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Account Payable NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Account Receivable NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Account Receivable AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Commission Collection",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Credit Assurance Recoveries",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Credit Control",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "CF - Supplier Maintenance Database",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "GTC Finance",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "Jetmax Finance",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "Independent Finance - AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "Independent Finance - NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.com"
    ],
    "cc": [
      "sienna_stanley@dummy.com"
    ]
  },
  {
    "clientName": "Air Systems Support",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "D365 Testing",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Fare Load - AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Fare Load - NA",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Fare Load - NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "GDS Hotel Audit",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Allotment",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "regina.naomi@dummy.com"
    ]
  },
  {
    "clientName": "Manual Load",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "regina.naomi@dummy.com"
    ]
  },
  {
    "clientName": "Dynamic Load",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "regina.naomi@dummy.com"
    ]
  },
  {
    "clientName": "Land Load QA",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "regina.naomi@dummy.com"
    ]
  },
  {
    "clientName": "Travelbox Load",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "regina.naomi@dummy.com"
    ]
  },
  {
    "clientName": "Operation Support",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "regina.naomi@dummy.com"
    ]
  },
  {
    "clientName": "Migration Tester - Supply Tech",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Migration Tester (ISTQB) - Supply Tech",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Sonic Load",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "GTC - Testers",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Ticketing QC",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Cruise About",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "D365 Support - NA",
    "region": "Indonesia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  },
  {
    "clientName": "Envoyage CA - Consultant Support",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.com"
    ],
    "cc": [
      "arya.dauh@ati.com",
      "lili_herliana@dummy.com"
    ]
  }
],
} as const satisfies {
  sourceWorkbook: string;
  sourceSheet: string;
  excludedSampleRows: number;
  records: readonly ClientMasterRoutingSeedRecord[];
};
