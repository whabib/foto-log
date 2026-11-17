/**
 * Countries (ISO 3166-1 alpha-2) and, for a few countries, their states or
 * provinces (ISO 3166-2). Country names come from Intl.DisplayNames, so
 * they don't need to be stored here.
 */

export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO " +
  "FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE " +
  "JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO " +
  "MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW " +
  "PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const COUNTRY_SET = new Set(COUNTRY_CODES);

export function isCountryCode(code: string): boolean {
  return COUNTRY_SET.has(code);
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

/** English name of a country, e.g. "United States" for "US". */
export function countryName(code: string): string {
  return countryNames.of(code) ?? code;
}

/** Countries listed first, ahead of the alphabetical list. */
const TOP_COUNTRIES = ["US"];

/** All countries: the United States first, then the rest sorted by English name. */
export function countryOptions(): { code: string; name: string }[] {
  const rest = COUNTRY_CODES.filter((code) => !TOP_COUNTRIES.includes(code))
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return [...TOP_COUNTRIES.map((code) => ({ code, name: countryName(code) })), ...rest];
}

type Subdivisions = {
  /** Label for the field, e.g. "State". */
  label: string;
  /** How the region appears in a location: its short code (TX) or full name (Jalisco). */
  display: "code" | "name";
  /** ISO 3166-2 code suffix -> name. */
  list: Record<string, string>;
};

function parse(entries: string): Record<string, string> {
  return Object.fromEntries(entries.split("|").map((e) => e.split(":") as [string, string]));
}

/** Countries whose states or provinces are picked from a list. */
export const SUBDIVISIONS: Record<string, Subdivisions> = {
  US: {
    label: "State",
    display: "code",
    list: parse(
      "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|" +
        "DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|" +
        "KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|" +
        "MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|" +
        "NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|" +
        "PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|" +
        "VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming",
    ),
  },
  CA: {
    label: "Province or territory",
    display: "code",
    list: parse(
      "AB:Alberta|BC:British Columbia|MB:Manitoba|NB:New Brunswick|NL:Newfoundland and Labrador|" +
        "NS:Nova Scotia|NT:Northwest Territories|NU:Nunavut|ON:Ontario|PE:Prince Edward Island|QC:Quebec|" +
        "SK:Saskatchewan|YT:Yukon",
    ),
  },
  AU: {
    label: "State or territory",
    display: "code",
    list: parse(
      "ACT:Australian Capital Territory|NSW:New South Wales|NT:Northern Territory|QLD:Queensland|" +
        "SA:South Australia|TAS:Tasmania|VIC:Victoria|WA:Western Australia",
    ),
  },
  BR: {
    label: "State",
    display: "code",
    list: parse(
      "AC:Acre|AL:Alagoas|AP:Amapá|AM:Amazonas|BA:Bahia|CE:Ceará|DF:Distrito Federal|ES:Espírito Santo|" +
        "GO:Goiás|MA:Maranhão|MT:Mato Grosso|MS:Mato Grosso do Sul|MG:Minas Gerais|PA:Pará|PB:Paraíba|" +
        "PR:Paraná|PE:Pernambuco|PI:Piauí|RJ:Rio de Janeiro|RN:Rio Grande do Norte|RS:Rio Grande do Sul|" +
        "RO:Rondônia|RR:Roraima|SC:Santa Catarina|SP:São Paulo|SE:Sergipe|TO:Tocantins",
    ),
  },
  MX: {
    label: "State",
    display: "name",
    list: parse(
      "AGU:Aguascalientes|BCN:Baja California|BCS:Baja California Sur|CAM:Campeche|CHP:Chiapas|" +
        "CHH:Chihuahua|CMX:Ciudad de México|COA:Coahuila|COL:Colima|DUR:Durango|GUA:Guanajuato|" +
        "GRO:Guerrero|HID:Hidalgo|JAL:Jalisco|MEX:Estado de México|MIC:Michoacán|MOR:Morelos|NAY:Nayarit|" +
        "NLE:Nuevo León|OAX:Oaxaca|PUE:Puebla|QUE:Querétaro|ROO:Quintana Roo|SLP:San Luis Potosí|" +
        "SIN:Sinaloa|SON:Sonora|TAB:Tabasco|TAM:Tamaulipas|TLA:Tlaxcala|VER:Veracruz|YUC:Yucatán|" +
        "ZAC:Zacatecas",
    ),
  },
  IN: {
    label: "State or union territory",
    display: "name",
    list: parse(
      "AN:Andaman and Nicobar Islands|AP:Andhra Pradesh|AR:Arunachal Pradesh|AS:Assam|BR:Bihar|" +
        "CH:Chandigarh|CG:Chhattisgarh|DH:Dadra and Nagar Haveli and Daman and Diu|DL:Delhi|GA:Goa|" +
        "GJ:Gujarat|HR:Haryana|HP:Himachal Pradesh|JK:Jammu and Kashmir|JH:Jharkhand|KA:Karnataka|" +
        "KL:Kerala|LA:Ladakh|LD:Lakshadweep|MP:Madhya Pradesh|MH:Maharashtra|MN:Manipur|ML:Meghalaya|" +
        "MZ:Mizoram|NL:Nagaland|OD:Odisha|PY:Puducherry|PB:Punjab|RJ:Rajasthan|SK:Sikkim|TN:Tamil Nadu|" +
        "TS:Telangana|TR:Tripura|UP:Uttar Pradesh|UK:Uttarakhand|WB:West Bengal",
    ),
  },
};

/** Label for the region field for `country`. */
export function regionLabel(country: string): string {
  return SUBDIVISIONS[country]?.label ?? "State, province or region";
}

/** The list of regions for `country` as [ISO 3166-2 code, name], sorted by name; null if free text. */
export function regionOptions(country: string): { code: string; name: string }[] | null {
  const sub = SUBDIVISIONS[country];
  if (!sub) return null;
  return Object.entries(sub.list)
    .map(([suffix, name]) => ({ code: `${country}-${suffix}`, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** True if `region` is a valid ISO 3166-2 code for a country that uses a list. */
export function isRegionCode(country: string, region: string): boolean {
  const sub = SUBDIVISIONS[country];
  if (!sub || !region.startsWith(`${country}-`)) return false;
  return Object.hasOwn(sub.list, region.slice(country.length + 1));
}

export type Location = { country: string; region?: string | null; locality?: string | null };

/**
 * A location the way it's usually written for that country, e.g.
 * "Austin, TX, United States", "Guadalajara, Jalisco, Mexico" or
 * "Lyon, France".
 */
export function formatLocation(loc: Location): string {
  const parts: string[] = [];
  if (loc.locality) parts.push(loc.locality);
  if (loc.region) {
    const sub = SUBDIVISIONS[loc.country];
    if (sub && isRegionCode(loc.country, loc.region)) {
      const suffix = loc.region.slice(loc.country.length + 1);
      parts.push(sub.display === "code" ? suffix : sub.list[suffix]);
    } else if (!sub) {
      parts.push(loc.region);
    }
  }
  parts.push(countryName(loc.country));
  return parts.join(", ");
}
