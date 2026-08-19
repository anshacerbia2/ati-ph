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
      "ferwinda.jansen@dummy.test",
      "gatirdo_saragih@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing NZ",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ferwinda.jansen@dummy.test",
      "gatirdo_saragih@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing Independent AU",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ilham_yunizar@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing UK",
    "region": "United Kingdom",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "yovita_mulyo@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing RSA",
    "region": "South Africa",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "yovita_mulyo@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing NA",
    "region": "North America",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ilham_yunizar@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing NA ACS",
    "region": "North America",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "ilham_yunizar@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Refund AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "chrestella.benedicta@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Refund Global",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "chrestella.benedicta@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.senior.leaders@dummy.test",
      "elisa_sulistio@dummy.test"
    ]
  },
  {
    "clientName": "Helio Support",
    "region": "Indonesia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "naviri.fidinna@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "Prohub Support",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "naviri.fidinna@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "Prohub Support Independent",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "UK Land",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "Profile Support",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "Product Delivery",
    "region": "Indonesia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "Content Creation",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "theresia.shavika@dummy.test"
    ],
    "cc": [
      "dl.au.jkt.prohub.seniorleaders@dummy.test",
      "lucia_fredricka@dummy.test"
    ]
  },
  {
    "clientName": "Supply FinOps",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "prawiratama_putra@dummy.test"
    ],
    "cc": [
      "viery.pradipta@dummy.test",
      "marcel.yonathan@dummy.test"
    ]
  },
  {
    "clientName": "Ignite Finance",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "marcel.yonathan@dummy.test"
    ],
    "cc": [
      "viery.pradipta@dummy.test",
      "prawiratama_putra@dummy.test"
    ]
  },
  {
    "clientName": "CF - Account Payable AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Account Payable NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Account Receivable NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Account Receivable AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Commission Collection",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Credit Assurance Recoveries",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Credit Control",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "CF - Supplier Maintenance Database",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "GTC Finance",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "Jetmax Finance",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "Independent Finance - AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "Independent Finance - NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "dl.au.jkt.corporate.finance.senior.spv@dummy.test"
    ],
    "cc": [
      "sienna_stanley@dummy.test"
    ]
  },
  {
    "clientName": "Air Systems Support",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "D365 Testing",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Fare Load - AU",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Fare Load - NA",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Fare Load - NZ",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "GDS Hotel Audit",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Allotment",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "regina.naomi@dummy.test"
    ]
  },
  {
    "clientName": "Manual Load",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "regina.naomi@dummy.test"
    ]
  },
  {
    "clientName": "Dynamic Load",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "regina.naomi@dummy.test"
    ]
  },
  {
    "clientName": "Land Load QA",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "regina.naomi@dummy.test"
    ]
  },
  {
    "clientName": "Travelbox Load",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "regina.naomi@dummy.test"
    ]
  },
  {
    "clientName": "Operation Support",
    "region": "Indonesia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "lili_herliana@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "regina.naomi@dummy.test"
    ]
  },
  {
    "clientName": "Migration Tester - Supply Tech",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Migration Tester (ISTQB) - Supply Tech",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Sonic Load",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "GTC - Testers",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Ticketing QC",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Cruise About",
    "region": "Australia",
    "dayFilter": "Weekdays",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "D365 Support - NA",
    "region": "Indonesia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  },
  {
    "clientName": "Envoyage CA - Consultant Support",
    "region": "Australia",
    "dayFilter": "Weekend",
    "status": "Active",
    "to": [
      "regina.naomi@dummy.test"
    ],
    "cc": [
      "arya.dauh@dummy.test",
      "lili_herliana@dummy.test"
    ]
  }
],
} as const satisfies {
  sourceWorkbook: string;
  sourceSheet: string;
  excludedSampleRows: number;
  records: readonly ClientMasterRoutingSeedRecord[];
};
