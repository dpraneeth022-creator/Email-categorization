import type {
  ClassificationRule,
  MailClassification,
  TrainingFeedbackExample,
} from './types.ts';

/**
 * Complete, cleaned & deduplicated RVCE Academic, Faculty, Administration,
 * Placement, and MathWorks Grader sender directory provided by the user.
 */
export const RVCE_ACADEMIC_SENDERS: string[] = Array.from(
  new Set([
    'hemalathajn@rvce.edu.in',
    'nagarajup@rvce.edu.in',
    'adinatha@rvce.edu.in',
    'sunandac@rvce.edu.in',
    'sureshac@rvce.edu.in',
    'ajaykm@rvce.edu.in',
    'madhubr@rvce.edu.in',
    'sushmitasarkar@rvce.edu.in',
    'parthsarathip@rvce.edu.in',
    'pnrao@rvce.edu.in',
    'aggadavi@gmail.com',
    'rachana.akki@rvce.edu.in',
    'abhilashkrishnadg@rvce.edu.in',
    'principal@rvce.edu.in',
    'viceprincipal@rvce.edu.in',
    'dean.academics@rvce.edu.in',
    'dean.studentaffairs@rvce.edu.in',
    'dean.research@rvce.edu.in',
    'coe@rvce.edu.in',
    'dean.csecluster@rvce.edu.in',
    'dean.circuit@rvce.edu.in',
    'dean.noncircuit@rvce.edu.in',
    'dean.cesd@rvce.edu.in',
    'placement@rvce.edu.in',
    'dean.gp@rvce.edu.in',
    'acd-engineering.rsst@rvei.edu.in',
    'acd-facilities.rsst@rvei.edu.in',
    'hod.ae@rvce.edu.in',
    'hod.ai@rvce.edu.in',
    'hod.bt@rvce.edu.in',
    'hod.ch@rvce.edu.in',
    'hod_civil@rvce.edu.in',
    'hod.cse@rvce.edu.in',
    'hod.ee@rvce.edu.in',
    'hod.ec@rvce.edu.in',
    'hod.it@rvce.edu.in',
    'hod.tc@rvce.edu.in',
    'hod.im@rvce.edu.in',
    'hod.ise@rvce.edu.in',
    'hod.me@rvce.edu.in',
    'director-mca@rvce.edu.in',
    'hod.physics@rvce.edu.in',
    'hod.maths@rvce.edu.in',
    'hod.chemistry@rvce.edu.in',
    'adean.bt@rvce.edu.in',
    'adean.cv@rvce.edu.in',
    'adean.tc@rvce.edu.in',
    'adean.ec@rvce.edu.in',
    'adean.is@rvce.edu.in',
    'adean.me@rvce.edu.in',
    'adean.cat@rvce.edu.in',
    'adean.pnt1@rvce.edu.in',
    'adean.pnt2@rvce.edu.in',
    'pc.cseds@rvce.edu.in',
    'pc.csecy@rvce.edu.in',
    'dy.coe@rvce.edu.in',
    'librarian@rvce.edu.in',
    'ravisharadhya@rvce.edu.in',
    'geethaks@rvce.edu.in',
    'uttarakumari@rvce.edu.in',
    'padmajakv@rvce.edu.in',
    'prasannakumar@rvce.edu.in',
    'rameshkb@rvce.edu.in',
    'anandjatti@rvce.edu.in',
    'veenadevi@rvce.edu.in',
    'abhayadeshpande@rvce.edu.in',
    'mahesha@rvce.edu.in',
    'shilpadr@rvce.edu.in',
    'govindarajum@rvce.edu.in',
    'sujathadb@rvce.edu.in',
    'chethanag@rvce.edu.in',
    'sujathah@rvce.edu.in',
    'rohinish@rvce.edu.in',
    'tabithajanumala@rvce.edu.in',
    'deepashree@rvce.edu.in',
    'rajanikatiyar@rvce.edu.in',
    'nethravathika@rvce.edu.in',
    'harsha@rvce.edu.in',
    'ramavenkateswarann@rvce.edu.in',
    'roopaj@rvce.edu.in',
    'rajasreepm@rvce.edu.in',
    'pnarashimaraja@rvce.edu.in',
    'veenadivyak@rvce.edu.in',
    'sowmyanagk@rvce.edu.in',
    'rajith.bkr@rvce.edu.in',
    'ravishankarholla@rvce.edu.in',
    'sujatapm@rvce.edu.in',
    'neetabm@rvce.edu.in',
    'deepikaprabhakar@rvce.edu.in',
    'shwethaprabhun@rvce.edu.in',
    'anushashekar@rvce.edu.in',
    'praveens@rvce.edu.in',
    'pratibhakantanavar@rvce.edu.in',
    'sindhur@rvce.edu.in',
    'avikbanerjee@rvce.edu.in',
    'ravishankars@rvce.edu.in',
    'usharani@rvce.edu.in',
    'kiranv@rvce.edu.in',
    'jayanthipn@rvce.edu.in',
    'kariyappabs@rvce.edu.in',
    'shylashreen@rvce.edu.in',
    'srividyap@rvce.edu.in',
    'sowmyakb@rvce.edu.in',
    'eleenamohapatra@rvce.edu.in',
    'supreethr@rvce.edu.in',
    'ravindraskulkarni@rvce.edu.in',
    'promiocharlesf@rvce.edu.in',
    'benjaminr@rvce.edu.in',
    'praneshkumarsr@rvce.edu.in',
    'ssrinivasan@rvce.edu.in',
    'mukeshm@rvce.edu.in',
    'karthikvele@rvce.edu.in',
    'ektajain@rvce.edu.in',
    'sraja@rvce.edu.in',
    'deepamalan@rvce.edu.in',
    'vijayalakshmi@rvce.edu.in',
    'anupamakumar@rvce.edu.in',
    'viswavardhank@rvce.edu.in',
    'narasimhaswamys@rvce.edu.in',
    'nagashreenrao@rvce.edu.in',
    'vidya.n@rvce.edu.in',
    'neeta@rvce.edu.in',
    'vijayakg@rvce.edu.in',
    'lingayah@rvce.edu.in',
    'rajeshwarim@rvce.edu.in',
    'ajeeth@rvce.edu.in',
    'shivandappa@rvce.edu.in',
    'praveenkgupta@rvce.edu.in',
    'narendraks@rvce.edu.in',
    'trilokc@rvce.edu.in',
    'raju22aybt@rvce.edu.in',
    'sumathram@rvce.edu.in',
    'ahmanjunatha@rvce.edu.in',
    'narayanav@rvce.edu.in',
    'ashwanisharma@rvce.edu.in',
    'jagadishhpatil@rvce.edu.in',
    'ranganathd@rvce.edu.in',
    'vinodkallur@rvce.edu.in',
    'basavarajarj@rvce.edu.in',
    'vidyac@rvce.edu.in',
    'rajalakshmim@rvce.edu.in',
    'ujwalshreenagm@rvce.edu.in',
    'manjulasarode@rvce.edu.in',
    'vinuthamoses@rvce.edu.in',
    'anupamavj@rvce.edu.in',
    'muralidharapl@rvce.edu.in',
    'radhakrishna@rvce.edu.in',
    'anantharamav@rvce.edu.in',
    'vinodar@rvce.edu.in',
    'lokeshwarim@rvce.edu.in',
    'nethravathis@rvce.edu.in',
    'durgaprashanthl@rvce.edu.in',
    'varunam@rvce.edu.in',
    'sindhud@rvce.edu.in',
    'sunils@rvce.edu.in',
    'praveenkumark@rvce.edu.in',
    'gajalakshmik@rvce.edu.in',
    'somanathmb@rvce.edu.in',
    'venugopalg@rvce.edu.in',
    'vikasm@rvce.edu.in',
    'vageeshhp@rvce.edu.in',
    'shrithisb@rvce.edu.in',
    'ramthilak@rvce.edu.in',
    'ravikiransw@rvce.edu.in',
    'shashikirancr@rvce.edu.in',
    'gowthamprasadme@rvce.edu.in',
    'ashwinthammaiahk@rvce.edu.in',
    'renukadevimv@rvce.edu.in',
    'raghavendrat@rvce.edu.in',
    'madhavik@rvce.edu.in',
    'anjaneyappa@rvce.edu.in',
    'archanamr@rvce.edu.in',
    'ramakanthkp@rvce.edu.in',
    'shantharangaswamy@rvce.edu.in',
    'krishnappahk@rvce.edu.in',
    'vinayvhegde@rvce.edu.in',
    'sowmyaranicn@rvce.edu.in',
    'hemavathyr@rvce.edu.in',
    'badarinath.kb@rvce.edu.in',
    'azranasreen@rvce.edu.in',
    'suchilaad@rvce.edu.in',
    'chethanamurthy@rvce.edu.in',
    'pratibad@rvce.edu.in',
    'praveenat@rvce.edu.in',
    'mohana@rvce.edu.in',
    'prapullasb@rvce.edu.in',
    'veenagadad@rvce.edu.in',
    'sneham@rvce.edu.in',
    'smritis@rvce.edu.in',
    'anithasandeep@rvce.edu.in',
    'manonmanis@rvce.edu.in',
    'deepikadash@rvce.edu.in',
    'apoorvaukc@rvce.edu.in',
    'rajatha@rvce.edu.in',
    'savitrikulkarni@rvce.edu.in',
    'ksunilkumar@rvce.edu.in',
    'mekhalap@rvce.edu.in',
    'saraswathigd@rvce.edu.in',
    'sahanads@rvce.edu.in',
    'sanjanaro@rvce.edu.in',
    'shraddhahd@rvce.edu.in',
    'shreyabt@rvce.edu.in',
    'daminin@rvce.edu.in',
    'dhanushcu@rvce.edu.in',
    'vallabhvk@rvce.edu.in',
    'rahulsajjan@rvce.edu.in',
    'aishwaryass@rvce.edu.in',
    'nischithask@rvce.edu.in',
    'someshnandi@rvce.edu.in',
    'rajeshrm@rvce.edu.in',
    'manasam@rvce.edu.in',
    'harshitha@rvce.edu.in',
    'rushikeshap@rvce.edu.in',
    'pranikaj@rvce.edu.in',
    'soumyaa@rvce.edu.in',
    'jyothis@rvce.edu.in',
    'sumab_rao@rvce.edu.in',
    'sindhudv@rvce.edu.in',
    'nithyashreegd@rvce.edu.in',
    'minalmoharir@rvce.edu.in',
    'pavithrah@rvce.edu.in',
    'manasmn@rvce.edu.in',
    'neethus@rvce.edu.in',
    'shwetababup@rvce.edu.in',
    'rajashreeshettar@rvce.edu.in',
    'srividyams@rvce.edu.in',
    'kalacl@rvce.edu.in',
    'nagarajags@rvce.edu.in',
    'sandhya.sampangi@rvce.edu.in',
    'ganashree@rvce.edu.in',
    'renumadhavi@rvce.edu.in',
    'sudarshanbg@rvce.edu.in',
    'rajeswararao@rvce.edu.in',
    'subramanyakn@rvce.edu.in',
    'nagendragupta@rvce.edu.in',
    'vijayakumar@rvce.edu.in',
    'ramaa@rvce.edu.in',
    'shobhans@rvce.edu.in',
    'vivekanands@rvce.edu.in',
    'chitrabt@rvce.edu.in',
    'vikramnb@rvce.edu.in',
    'binduashwini@rvce.edu.in',
    'shruthimn@rvce.edu.in',
    'nandinibiem@rvce.edu.in',
    'bhaskarmg@rvce.edu.in',
    'naraharins@rvce.edu.in',
    'mamathags@rvce.edu.in',
    'sagarbm@rvce.edu.in',
    'ashwinikb@rvce.edu.in',
    'vanishreek@rvce.edu.in',
    'merinmeleet@rvce.edu.in',
    'raghavendrap@rvce.edu.in',
    'rekhabs@rvce.edu.in',
    'shwetha.ise@rvce.edu.in',
    'bksrinivas@rvce.edu.in',
    'sushmithan@rvce.edu.in',
    'chethanar@rvce.edu.in',
    'kavithasn@rvce.edu.in',
    'rashmir@rvce.edu.in',
    'analamr@rvce.edu.in',
    'padmashreet@rvce.edu.in',
    'poornimapk@rvce.edu.in',
    'jasmineks@rvce.edu.in',
    'ushaj@rvce.edu.in',
    'andhedharani@rvce.edu.in',
    'renukaprasadb@rvce.edu.in',
    'chandrashekarbh@rvce.edu.in',
    'deepikak@rvce.edu.in',
    'mohanaradhya@rvce.edu.in',
    'divyatl@rvce.edu.in',
    'saravananc@rvce.edu.in',
    'chandrani@rvce.edu.in',
    'savitas.sheelavant@rvce.edu.in',
    'savithar@rvce.edu.in',
    'prashanthk@rvce.edu.in',
    'shanmukhan@rvce.edu.in',
    'nanjundaradhya@rvce.edu.in',
    'sridharr@rvce.edu.in',
    'sriharipv@rvce.edu.in',
    'harishask@rvce.edu.in',
    'ratnapal@rvce.edu.in',
    'mahanteshm@rvce.edu.in',
    'nageshs@rvce.edu.in',
    'ramakrishna@rvce.edu.in',
    'chandrakumarr@rvce.edu.in',
    'sourabhash@rvce.edu.in',
    'girishva@rvce.edu.in',
    'ajaneygag@rvce.edu.in',
    'sujanchakraborty@rvce.edu.in',
    'keshavamurthyyc@rvce.edu.in',
    'keshavm@rvce.edu.in',
    'girishkumarr@rvce.edu.in',
    'gangadharangadi@rvce.edu.in',
    'ranganayakuluj@rvce.edu.in',
    'prapulchandraac@rvce.edu.in',
    'rakeshkumar@rvce.edu.in',
    'gajanan@rvce.edu.in',
    'abhiramer@rvce.edu.in',
    'krishnam@rvce.edu.in',
    'natarajjr@rvce.edu.in',
    'venkateshpr@rvce.edu.in',
    'rajkumargr@rvce.edu.in',
    'bharatisha@rvce.edu.in',
    'roopats@rvce.edu.in',
    'rameshssharma@rvce.edu.in',
    'kirthanlj@rvce.edu.in',
    'jagannathagvl@rvce.edu.in',
    'nagamanik@rvce.edu.in',
    'kumaraswamyhv@rvce.edu.in',
    'sreelakshmik@rvce.edu.in',
    'rojareddyb@rvce.edu.in',
    'premanandabs@rvce.edu.in',
    'bhagyar@rvce.edu.in',
    'shanthip@rvce.edu.in',
    'kamakshimb@rvce.edu.in',
    'shambulingam@rvce.edu.in',
    'sandhyahb@rvce.edu.in',
    'nagendrann@rvce.edu.in',
    'mahalakshmimn@rvce.edu.in',
    'rakeshkr@rvce.edu.in',
    'ksaraswathi@rvce.edu.in',
    'ranjanig@rvce.edu.in',
    'shireeshag@rvce.edu.in',
    'sudhakamath@rvce.edu.in',
    'avadhanidn@rvce.edu.in',
    'shubhas@rvce.edu.in',
    'tgupta@rvce.edu.in',
    'rajeshbm@rvce.edu.in',
    'ramyap@rvce.edu.in',
    'niranjanakm@rvce.edu.in',
    'dileepms@rvce.edu.in',
    'shwethakp@rvce.edu.in',
    'riniganguly@rvce.edu.in',
    'kavyakn@rvce.edu.in',
    'ravirajak@rvce.edu.in',
    'swarnamp@rvce.edu.in',
    'manjunathac@rvce.edu.in',
    'divakarsg@rvce.edu.in',
    'shamaan.mp@rvce.edu.in',
    'sridharanm@rvce.edu.in',
    'vishnumurthyka@rvce.edu.in',
    'girishkumars@rvce.edu.in',
    'swethasm@rvce.edu.in',
    'ritahs@rvce.edu.in',
    'nradha@rvce.edu.in',
    'jayalathag@rvce.edu.in',
    'neethighiya@rvce.edu.in',
    'nandeeshkumarc@rvce.edu.in',
    'savithrishashidhar@rvce.edu.in',
    'prakashr@rvce.edu.in',
    'sowmyam@rvce.edu.in',
    'satishvm@rvce.edu.in',
    'sailajay@rvce.edu.in',
    'sujathaa@rvce.edu.in',
    'vidyavathipatil@yahoo.com',
    'nivnirmal@gmail.com',
    'drravikm@rvce.edu.in',
    'rajashekarpl@rvce.edu.in',
    'sumannp@rvce.edu.in',
    'harishm@rvce.edu.in',
    'kirankumardl@rvce.edu.in',
    'venugopalk@rvce.edu.in',
    'niranjanpk@rvce.edu.in',
    'sumanm@rvce.edu.in',
    'prasannakt@rvce.edu.in',
    'sakshath.tn@gmail.com',
    'hemanthkumarb@rvce.edu.in',
    'kirthigam@rvce.edu.in',
    'vyshnavid@rvce.edu.in',
    'mail.grader.mathworks.com',
    'ctto.firstyear@rvce.edu.in',
  ])
);

export const DEFAULT_CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    id: 'volunteering',
    name: 'VOLUNTEERING MAILS',
    shortName: 'Volunteering',
    description:
      'Messages from NSS, NCC, or any sender inviting students to volunteering, community service, blood donation camps, cleanliness drives, NGO outreach, plantation drives, social work, charity, or civic relief initiatives.',
    accent: 'emerald',
    senders: ['nss@rvce.edu.in', 'nccrvce@rvce.edu.in'],
    keywords: [
      'volunteering',
      'volunteer',
      'volunteers needed',
      'call for volunteers',
      'nss',
      'ncc',
      'community service',
      'blood donation',
      'cleanliness drive',
      'swachh bharat',
      'plantation drive',
      'social outreach',
      'ngo',
      'rotaract',
      'youth red cross',
      'charity drive',
      'relief camp',
      'social responsibility',
      'awareness drive',
      'community outreach',
      'teaching drive',
      'donation camp',
      'civic service',
    ],
    useAiSemantics: true,
    isSystemDefault: true,
  },
  {
    id: 'clubs',
    name: 'CLUBS',
    shortName: 'Clubs',
    description:
      'Any email mentioning the word "club" in subject, sender, or body, plus club recruitments, club sessions, inductions, and club events — strictly separated from Academic Mails even when sent or forwarded by faculty, HOD, Librarian, or Dean.',
    accent: 'violet',
    senders: [],
    keywords: [
      'club',
      'clubs',
      'student club',
      'coding club',
      'robotics club',
      'club recruitment',
      'club induction',
      'club session',
      'club event',
      'club meeting',
    ],
    useAiSemantics: true,
    isSystemDefault: true,
  },
  {
    id: 'surveys',
    name: 'SURVEYS',
    shortName: 'Surveys',
    description:
      'Campus surveys, student questionnaires, feedback forms, research polls, and SurveyMonkey / Qualtrics / Typeform / Google Form survey requests — always separated from Academic Mails.',
    accent: 'amber',
    senders: [],
    keywords: [
      'survey',
      'surveys',
      'questionnaire',
      'feedback form',
      'course feedback',
      'student feedback',
      'surveymonkey',
      'qualtrics',
      'typeform',
      'fill out this survey',
      'campus poll',
    ],
    useAiSemantics: true,
    isSystemDefault: true,
  },
  {
    id: 'academic',
    name: 'ACADEMIC MAILS',
    shortName: 'Academic',
    description:
      'Strictly reserved for coursework, Experiential Learning (EL, EL phase, EL evaluation, EL team, EL project, EL review), CIE/SEE exams, seating arrangements, syllabus, Google Classroom updates, MATLAB Grader, and official academic circulars.',
    accent: 'blue',
    senders: [
      'mail.grader.mathworks.com',
      'classroom.google.com',
      'no-reply@classroom.google.com',
    ],
    keywords: [
      'experiential learning',
      'el phase',
      'el evaluation',
      'el team',
      'el project',
      'el review',
      'cie',
      'see exam',
      'seating arrangement',
      'syllabus',
      'google classroom',
      'matlab grader',
      'mathworks grader',
      'coursework',
      'assignment',
      'timetable',
      'lab manual',
      'internal assessment',
      'academic circular',
      'hall ticket',
      'makeup exam',
      'revaluation',
    ],
    useAiSemantics: true,
    isSystemDefault: true,
  },
  {
    id: 'spam',
    name: 'SPAM MAILS',
    shortName: 'Spam',
    description:
      'Promotional and marketing blasts (Lenovo, Unlox, Corizo), fake or paid internships, rewards and lottery claims, unauthorized scholarships, phishing, and scams.',
    accent: 'rose',
    senders: [
      'lenovo.com',
      'unlox.com',
      'unlox.in',
      'corizo.in',
      'corizo.com',
    ],
    keywords: [
      'lenovo',
      'unlox',
      'corizo',
      'fake internship',
      'paid internship',
      'virtual internship',
      'guaranteed stipend',
      'internship certificate',
      'claim your prize',
      'claim your reward',
      'you have won',
      'lottery winner',
      'lucky draw',
      'jackpot',
      'cash prize',
      'congratulations winner',
      'free gift reward',
      'unauthorized scholarship',
      'scholarship awarded',
      'free scholarship',
      'crypto giveaway',
      'instant loan',
      'pre-approved loan',
      'casino bonus',
      'betting bonus',
      'verify your account immediately',
      'click here to claim',
    ],
    useAiSemantics: true,
    isSystemDefault: true,
  },
];

export const CURRENT_RULES_VERSION = 'v7_strict_single_category';

/**
 * Decodes HTML entities (&#39;, &quot;, &amp;, &lt;, &gt;, numeric hex/decimal entities)
 * so email snippets and subjects render cleanly.
 */
export function decodeHtmlEntities(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractEmailAddress(rawFrom: string): string {
  const angleMatch = rawFrom.match(/<([^>]+)>/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase();
  }
  const emailMatch = rawFrom.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch?.[0]) {
    return emailMatch[0].trim().toLowerCase();
  }
  return rawFrom.trim().toLowerCase();
}

export function extractDisplayName(rawFrom: string): string {
  const angleMatch = rawFrom.match(/^([^<]+)<[^>]+>/);
  if (angleMatch?.[1]) {
    const cleaned = decodeHtmlEntities(angleMatch[1].replace(/^["'\s]+|["'\s]+$/g, ''));
    if (cleaned.length > 0) return cleaned;
  }
  const email = extractEmailAddress(rawFrom);
  const local = email.split('@')[0] || rawFrom;
  return decodeHtmlEntities(local);
}

/**
 * Strictly extracts ONLY the From: email address (never inspects To: or forwarded body headers).
 */
export function extractCandidateSenders(input: {
  fromEmail?: string;
}): string[] {
  if (!input.fromEmail) return [];
  const addr = extractEmailAddress(input.fromEmail);
  return addr ? [addr] : [];
}

const VOLUNTEERING_SIGNAL_REGEX =
  /\b(volunteering|volunteer|volunteers|nss|ncc|blood\s+donation|cleanliness\s+drive|swachh\s+bharat|plantation\s+drive|community\s+service|social\s+outreach|rotaract|youth\s+red\s+cross|relief\s+camp|charity\s+drive|ngo\b|donation\s+camp|civic\s+service)\b/i;

// Matches "club" or "clubs" case-insensitively anywhere (word boundary or embedded in club names/handles)
const CLUB_WORD_REGEX = /\bclubs?\b|club\s*(?:recruitment|recruitments|induction|inductions|session|sessions|event|events|meeting|meetings|orientation|activity|activities|members?|registration|registrations|fair|expo)/i;

const SURVEY_SIGNAL_REGEX =
  /\b(surveys?|questionnaires?|feedback\s+forms?|course\s+feedback|student\s+feedback|campus\s+poll|opinion\s+poll|surveymonkey|qualtrics|typeform)\b/i;

// Sports, Cultural & College/Departmental Fest emails → General Inbox (NEVER Academic)
const SPORTS_CULTURAL_FEST_REGEX =
  /\b(sports\s+trials?|selection\s+trials?|physical\s+education|dept\.?\s+of\s+physical\s+education|department\s+of\s+physical\s+education|sports\s+day|annual\s+sports|inter-?collegiate\s+(?:sports|tournament|match)|marathon|cyclothon|walkathon|fun\s+run|rvce\s+run|5k\s+run|10k\s+run|athletics\s+meet|cricket\s+trials?|football\s+trials?|basketball\s+trials?|badminton\s+trials?|volleyball\s+trials?|kabaddi\s+trials?|throwball\s+trials?|chess\s+trials?|table\s+tennis\s+trials?|swimming\s+trials?|carv\b|evoke\b|auditions?\b|cultural\s+(?:auditions?|team|fest|event|events|night|day)|fashion\s+(?:show|team|auditions?)|dance\s+(?:auditions?|team|competition|troupe)|music\s+(?:auditions?|team|competition|night)|battle\s+of\s+bands|alaap\b|footprints?\b|8th\s*mile|eighth\s+mile|react\s+(?:20\d\d|fest|symposium|event|tech)|synergy\s*(?:20\d\d|fest|event|rvce)?|\bsynergy\b|\baeromania\b|\bignitron\b|\btech\s*fest\b|\bcollege\s+fest\b|\bdepartment(?:al)?\s+fest\b|\bannual\s+fest\b|\bfest\s+registration\b|\bcultural\s+extravaganza\b)\b/i;

const REACT_FEST_REGEX = /\bREACT\b/;

// Promotional & Marketing blasts explicitly marked as Spam (Lenovo, Unlox, Corizo, etc.)
const PROMOTIONAL_SPAM_BRANDS_REGEX = /\b(lenovo|unlox|corizo)\b/i;

// Google Security Alerts → General Inbox
const GOOGLE_SECURITY_ALERT_REGEX =
  /\b(security\s+alert|critical\s+security\s+alert|new\s+sign-?in|2-?step\s+verification|recovery\s+(?:email|phone)|app\s+password\s+created|google\s+account\s+security)\b/i;

// Experiential Learning (EL) signal — strictly categorized under Academic (NEVER General)
const EXPERIENTIAL_LEARNING_PHRASE_REGEX =
  /\b(experiential[\s-]+learning|el[\s-]*(?:phase|phases|evaluation|evaluations|team|teams|project|projects|review|reviews|presentation|presentations|submission|submissions|rubric|rubrics|topic|topics|report|reports|group|groups|batch|batches|marks|guide|mentor|coordinator|viva|synopsis|demo|exhibition|schedule|timetable|registration|formation|allotment|panel|slot|slots|[1-4]|i{1,3}))\b/i;

const EXPERIENTIAL_LEARNING_UPPER_EL_REGEX = /(?:^|[\s([\-:,/])(?:EL|E\.L\.?)(?=$|[\s)\]\-:.,/!?])/;
const EXPERIENTIAL_LEARNING_SUBJECT_EL_REGEX = /\bel\b/i;

// Strict Academic signal: coursework, Experiential Learning (EL), CIE/SEE exams, seating arrangements, syllabus, Google Classroom, MATLAB Grader, official academic circulars
const STRICT_ACADEMIC_REGEX =
  /\b(cie\b|cie-?\s*[123]|see\s+(?:exam|examination|timetable|schedule|result|results|seating)|seating\s+arrangement|exam\s+(?:seating|schedule|timetable|hall|centre|center|notification|circular|form|registration|result|results)|examination\s+(?:schedule|timetable|circular|notification|seating)|hall\s+ticket|revaluation|makeup\s+exam|make-?up\s+exam|supplementary\s+exam|syllabus|coursework|course\s+(?:registration|plan|material|outline|handout|drop|add)|google\s+classroom|new\s+(?:assignment|material|announcement)\s*:|matlab\s+grader|mathworks\s+grader|\bel\s+(?:review|reviews|phase|phases|evaluation|team|teams|project|projects|presentation|submission|rubric|topic|report)\b|experiential[\s-]+learning|project\s+(?:review|evaluation|submission|viva)|mini-?project\s+(?:review|viva)|lab\s+(?:manual|exam|test|internal|schedule|record|observation|viva)|internal\s+assessment|time\s*table|class\s+schedule|academic\s+(?:calendar|circular|schedule|council|regulation|notice|dean)|office\s+of\s+(?:dean\s+academics|controller\s+of\s+examinations|coe\b)|commencement\s+of\s+(?:classes|semester)|odd\s+semester|even\s+semester|attendance\s+(?:shortage|detention|list|update)|assignment\s+(?:due|submission|deadline|posted)|quiz\s+(?:schedule|link|marks)|marks\s+(?:sheet|list|published|uploaded)|grade\s+(?:card|sheet)|cgpa|sgpa|vtu\s+circular|working\s+saturday|class\s+(?:rescheduled|cancelled|postponed|timings)|lecture\s+(?:notes|slides)|semester\s+end\s+exam|backlog\s+exam)\b/i;

export function hasStrongVolunteeringSignal(
  subject?: string,
  snippet?: string,
  bodyText?: string
): boolean {
  const combined = decodeHtmlEntities(
    `${subject || ''} ${snippet || ''} ${(bodyText || '').slice(0, 600)}`
  );
  return VOLUNTEERING_SIGNAL_REGEX.test(combined);
}

export function hasSurveySignal(input: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  const textCombined = decodeHtmlEntities(
    `${input.fromName || ''} ${input.subject || ''} ${input.snippet || ''} ${(
      input.bodyText || ''
    ).slice(0, 1200)}`
  );
  if (SURVEY_SIGNAL_REGEX.test(textCombined)) {
    return true;
  }

  const fromAddr = extractEmailAddress(input.fromEmail || '');
  if (fromAddr) {
    const localPart = fromAddr.split('@')[0] || '';
    if (localPart.includes('survey')) {
      return true;
    }
  }

  return false;
}

export function hasClubSignal(input: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  const textCombined = decodeHtmlEntities(
    `${input.fromName || ''} ${input.subject || ''} ${input.snippet || ''} ${(
      input.bodyText || ''
    ).slice(0, 1500)}`
  );
  if (CLUB_WORD_REGEX.test(textCombined)) {
    return true;
  }

  // Strictly inspect ONLY the From: email address (never To:)
  const fromAddr = extractEmailAddress(input.fromEmail || '');
  if (fromAddr) {
    const localPart = fromAddr.split('@')[0] || '';
    if (localPart.includes('club')) {
      return true;
    }
  }

  return false;
}

export function hasSportsCulturalFestSignal(input: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  const rawCombined = decodeHtmlEntities(
    `${input.fromName || ''} ${input.subject || ''} ${input.snippet || ''} ${(
      input.bodyText || ''
    ).slice(0, 1000)}`
  );
  if (SPORTS_CULTURAL_FEST_REGEX.test(rawCombined)) {
    return true;
  }
  // Uppercase "REACT" fest mention (avoids matching lowercase "react" in normal English or React.js coursework unless fest context)
  if (
    REACT_FEST_REGEX.test(`${input.subject || ''} ${input.snippet || ''}`) &&
    !/\b(react\.?js|reactjs|frontend|javascript|component|useState|useEffect)\b/i.test(rawCombined)
  ) {
    return true;
  }
  const fromAddr = extractEmailAddress(input.fromEmail || '');
  if (
    fromAddr &&
    /\b(sports|physicaleducation|ped|cultural|carv|evoke|8thmile|aeromania|ignitron|synergy)\b/i.test(
      fromAddr.split('@')[0] || ''
    )
  ) {
    return true;
  }
  return false;
}

export function hasExperientialLearningSignal(input: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  const cleanSubject = decodeHtmlEntities(input.subject || '');
  const combined = decodeHtmlEntities(
    `${input.fromName || ''} ${cleanSubject} ${input.snippet || ''} ${(
      input.bodyText || ''
    ).slice(0, 1500)}`
  );

  if (EXPERIENTIAL_LEARNING_PHRASE_REGEX.test(combined)) {
    return true;
  }

  // Case-sensitive standalone "EL" / "E.L." anywhere in subject, snippet, or body
  if (EXPERIENTIAL_LEARNING_UPPER_EL_REGEX.test(combined)) {
    return true;
  }

  // Case-insensitive standalone "el" in subject or from RVCE institutional mail
  const fromAddr = extractEmailAddress(input.fromEmail || '');
  if (
    EXPERIENTIAL_LEARNING_SUBJECT_EL_REGEX.test(cleanSubject) ||
    (isOfficialInstitutionalOrGovEmail(fromAddr) &&
      EXPERIENTIAL_LEARNING_SUBJECT_EL_REGEX.test(combined))
  ) {
    return true;
  }

  return false;
}

export function hasStrictAcademicSignal(input: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  if (hasExperientialLearningSignal(input)) {
    return true;
  }

  const fromAddr = extractEmailAddress(input.fromEmail || '');
  const domain = getDomainFromAddress(fromAddr);
  // Inherently academic platforms
  if (
    domain === 'mail.grader.mathworks.com' ||
    domain.endsWith('.grader.mathworks.com') ||
    domain === 'classroom.google.com' ||
    fromAddr === 'no-reply@classroom.google.com'
  ) {
    return true;
  }

  const combined = decodeHtmlEntities(
    `${input.fromName || ''} ${input.subject || ''} ${input.snippet || ''} ${(
      input.bodyText || ''
    ).slice(0, 1200)}`
  );
  return STRICT_ACADEMIC_REGEX.test(combined);
}

/**
 * Matches a single From: email address against exact entries or domain entries in a rule.
 */
function matchAddressAgainstRule(
  normalizedEmail: string,
  rule: ClassificationRule,
  exactOnly: boolean
): string | null {
  if (!normalizedEmail) return null;
  const domainPart = normalizedEmail.includes('@')
    ? normalizedEmail.split('@')[1]
    : normalizedEmail;

  for (const rawEntry of rule.senders) {
    const entry = rawEntry.trim().toLowerCase();
    if (!entry) continue;

    if (entry.includes('@')) {
      if (normalizedEmail === entry) {
        return entry;
      }
    } else if (!exactOnly) {
      if (domainPart === entry || domainPart.endsWith(`.${entry}`)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Official domains of popular, legitimate websites and platforms.
 * Emails from these official domains go to General Inbox (not Spam), unless
 * matched to a dedicated campus category or promotional spam blocklist.
 */
export const TRUSTED_POPULAR_DOMAINS: readonly string[] = [
  // Tech, Cloud & Developer Platforms
  'google.com',
  'accounts.google.com',
  'youtube.com',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'stackexchange.com',
  'microsoft.com',
  'live.com',
  'office.com',
  'apple.com',
  'icloud.com',
  'adobe.com',
  'figma.com',
  'notion.so',
  'makenotion.com',
  'canva.com',
  'atlassian.com',
  'slack.com',
  'discord.com',
  'zoom.us',
  'dropbox.com',
  'openai.com',
  'anthropic.com',
  'vercel.com',
  'netlify.com',
  'render.com',
  'heroku.com',
  'cloudflare.com',
  'digitalocean.com',
  'aws.amazon.com',
  'amazon.com',
  'amazon.in',
  'nvidia.com',
  'intel.com',
  'mathworks.com',
  'kaggle.com',
  'huggingface.co',
  'replit.com',
  'postman.com',
  'jetbrains.com',
  'mongodb.com',
  'supabase.io',
  'firebase.google.com',
  // Learning, Coding & Verified Career Portals
  'coursera.org',
  'udemy.com',
  'edx.org',
  'khanacademy.org',
  'leetcode.com',
  'hackerrank.com',
  'hackerearth.com',
  'codechef.com',
  'codeforces.com',
  'geeksforgeeks.org',
  'nptel.ac.in',
  'swayam.gov.in',
  'linkedin.com',
  'naukri.com',
  'internshala.com',
  'unstop.com',
  'indeed.com',
  'glassdoor.com',
  'medium.com',
  'substack.com',
  'quora.com',
  'reddit.com',
  'redditmail.com',
  'duolingo.com',
  'grammarly.com',
  // Social, Media & Entertainment
  'instagram.com',
  'facebookmail.com',
  'meta.com',
  'x.com',
  'twitter.com',
  'netflix.com',
  'spotify.com',
  'primevideo.com',
  'hotstar.com',
  'bookmyshow.com',
  'pinterest.com',
  'snapchat.com',
  'whatsapp.com',
  'telegram.org',
  // E-Commerce, Travel, Food & Daily Services
  'flipkart.com',
  'myntra.com',
  'ajio.com',
  'nykaa.com',
  'meesho.com',
  'swiggy.in',
  'swiggy.com',
  'zomato.com',
  'blinkit.com',
  'zeptonow.com',
  'bigbasket.com',
  'uber.com',
  'olacabs.com',
  'rapido.bike',
  'irctc.co.in',
  'makemytrip.com',
  'goibibo.com',
  'airbnb.com',
  'booking.com',
  'indigo.in',
  'goindigo.in',
  'airindia.com',
  // Payments & Official Banks
  'paypal.com',
  'stripe.com',
  'razorpay.com',
  'paytm.com',
  'phonepe.com',
  'cred.club',
  'hdfcbank.net',
  'hdfcbank.com',
  'icicibank.com',
  'sbi.co.in',
  'axisbank.com',
  'kotak.com',
  'zerodha.com',
  'groww.in',
  'upstox.com',
];

function getDomainFromAddress(email: string): string {
  const cleaned = extractEmailAddress(email);
  const atIdx = cleaned.lastIndexOf('@');
  if (atIdx < 0) return '';
  return cleaned.slice(atIdx + 1).toLowerCase();
}

export function isOfficialPopularWebsiteEmail(email?: string): boolean {
  if (!email) return false;
  const domain = getDomainFromAddress(email);
  if (!domain) return false;
  return TRUSTED_POPULAR_DOMAINS.some(
    (trusted) => domain === trusted || domain.endsWith(`.${trusted}`)
  );
}

export function isOfficialInstitutionalOrGovEmail(email?: string): boolean {
  if (!email) return false;
  const domain = getDomainFromAddress(email);
  if (!domain) return false;
  return (
    domain === 'rvce.edu.in' ||
    domain.endsWith('.rvce.edu.in') ||
    domain === 'rvei.edu.in' ||
    domain.endsWith('.rvei.edu.in') ||
    domain.endsWith('.gov.in') ||
    domain.endsWith('.nic.in') ||
    domain.endsWith('.ac.in') ||
    domain.endsWith('.edu.in') ||
    domain.endsWith('.edu')
  );
}

const OBVIOUS_SPAM_SIGNAL_REGEX =
  /\b(claim\s+your\s+prize|claim\s+your\s+reward|you\s+have\s+won|lottery\s+winner|lucky\s+draw|jackpot|cash\s+prize|prize\s+winner|spin\s+to\s+win|crypto\s+giveaway|instant\s+loan|pre-approved\s+loan|casino\s+bonus|betting\s+bonus|verify\s+your\s+account\s+immediately|urgent\s+account\s+suspension|wire\s+transfer\s+urgent|earn\s+(?:\$|rs\.?|₹)?\d+\s+per\s+day\s+from\s+home|click\s+here\s+to\s+claim|100%\s+free\s+gift)\b/i;

const UNAUTHORIZED_FAKE_OPPORTUNITY_SPAM_REGEX =
  /\b(fake\s+internship|paid\s+internship|virtual\s+internship|internship\s+with\s+certificate|guaranteed\s+internship|guaranteed\s+stipend|stipend\s+up\s+to|training\s*(?:&|and|\+)\s*internship|industrial\s+training\s*(?:&|and)\s*internship|register\s+now\s+for\s+internship|summer\s+internship\s+program|winter\s+internship\s+program|internship\s+offer\s+letter|free\s+scholarship|scholarship\s+awarded|selected\s+for\s+(?:a\s+)?scholarship|claim\s+your\s+scholarship|scholarship\s+grant|apply\s+now\s+for\s+scholarship|reward\s+points\s+expiring|exclusive\s+cash\s+reward|won\s+(?:a\s+)?(?:reward|lottery|voucher|iphone)|lottery\s+ticket|mega\s+reward)\b/i;

export interface DeterministicMatchResult {
  categoryId: string;
  rule: ClassificationRule | null;
  matchedEntry: string;
}

/**
 * Strict single-category deterministic classifier (From-only, never matches To:):
 * 1. Personal SENT emails & Google Security Alerts -> General Inbox
 * 2. Clubs Override (HIGHEST priority over Academic): word "club" in subject/sender/body or club events -> Clubs
 * 3. Surveys (survey/questionnaire/feedback forms) -> Surveys
 * 4. Volunteering (nss@rvce.edu.in, nccrvce@rvce.edu.in, or volunteering drives) -> Volunteering
 * 5. Sports, Cultural (CARV/EVOKE/auditions/music/dance/fashion) & Fests (REACT/Synergy/Aeromania/Ignitron) -> General Inbox
 * 6. Promotional blasts (Lenovo, Unlox, Corizo) & Unauthorized Spam (fake internships, rewards/lotteries, unauthorized scholarships, Gmail SPAM) -> Spam
 * 7. Strict Academic (Google Classroom, MATLAB Grader, CIE/SEE, seating arrangements, syllabus, coursework, EL reviews, official academic circulars) -> Academic
 */
export function matchMessageDeterministically(
  msg: {
    fromName?: string;
    fromEmail?: string;
    subject?: string;
    snippet?: string;
    bodyText?: string;
    labelIds?: string[];
  },
  rules: ClassificationRule[]
): DeterministicMatchResult | null {
  const fromAddr = extractEmailAddress(msg.fromEmail || '');
  const fromDomain = getDomainFromAddress(fromAddr);
  const combinedText = decodeHtmlEntities(
    `${msg.fromName || ''} ${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 1200)}`
  );

  const volunteeringRule = rules.find((r) => r.id === 'volunteering') || null;
  const surveysRule = rules.find((r) => r.id === 'surveys') || null;
  const clubsRule = rules.find((r) => r.id === 'clubs') || null;
  const academicRule = rules.find((r) => r.id === 'academic') || null;
  const spamRule = rules.find((r) => r.id === 'spam') || null;

  // 1. Personal sent emails & Google Security Alerts ALWAYS go to General Inbox
  if (msg.labelIds?.includes('SENT') && !msg.labelIds?.includes('INBOX')) {
    return {
      categoryId: 'general',
      rule: null,
      matchedEntry: 'personal sent email',
    };
  }
  if (
    fromAddr === 'no-reply@accounts.google.com' ||
    (fromDomain.endsWith('google.com') && GOOGLE_SECURITY_ALERT_REGEX.test(combinedText))
  ) {
    return {
      categoryId: 'general',
      rule: null,
      matchedEntry: 'Google security alert',
    };
  }

  // 2. CLUBS OVERRIDE (Highest priority over Academic, even if sent/forwarded by faculty, HOD, Librarian, or Dean)
  if (clubsRule) {
    if (fromAddr) {
      const m = matchAddressAgainstRule(fromAddr, clubsRule, false);
      if (m) return { categoryId: clubsRule.id, rule: clubsRule, matchedEntry: m };
    }
    if (hasClubSignal(msg)) {
      return { categoryId: clubsRule.id, rule: clubsRule, matchedEntry: 'club override' };
    }
  }

  // 3. SURVEYS (always separated from Academic)
  if (surveysRule) {
    if (fromAddr) {
      const m = matchAddressAgainstRule(fromAddr, surveysRule, false);
      if (m) return { categoryId: surveysRule.id, rule: surveysRule, matchedEntry: m };
    }
    if (hasSurveySignal(msg)) {
      return { categoryId: surveysRule.id, rule: surveysRule, matchedEntry: 'survey signal' };
    }
  }

  // 4. VOLUNTEERING (NSS, NCC, blood donation, community service drives)
  if (volunteeringRule) {
    if (fromAddr) {
      const m = matchAddressAgainstRule(fromAddr, volunteeringRule, false);
      if (m) return { categoryId: volunteeringRule.id, rule: volunteeringRule, matchedEntry: m };
    }
    if (hasStrongVolunteeringSignal(msg.subject, msg.snippet, msg.bodyText)) {
      return {
        categoryId: volunteeringRule.id,
        rule: volunteeringRule,
        matchedEntry: 'volunteering drive',
      };
    }
  }

  // 4.5. EXPERIENTIAL LEARNING (EL) -> Academic (strictly overrides General)
  if (academicRule && hasExperientialLearningSignal(msg)) {
    return {
      categoryId: academicRule.id,
      rule: academicRule,
      matchedEntry: 'Experiential Learning (EL)',
    };
  }

  // 5. SPORTS, CULTURAL & FEST MAILS -> General Inbox (NEVER Academic)
  if (hasSportsCulturalFestSignal(msg)) {
    return {
      categoryId: 'general',
      rule: null,
      matchedEntry: 'sports / cultural / fest mail',
    };
  }

  // 6. PROMOTIONAL BLASTS (Lenovo, Unlox, Corizo) & SPAM
  if (spamRule) {
    if (fromAddr) {
      const m = matchAddressAgainstRule(fromAddr, spamRule, false);
      if (m) return { categoryId: spamRule.id, rule: spamRule, matchedEntry: m };
    }
    if (
      PROMOTIONAL_SPAM_BRANDS_REGEX.test(fromAddr) ||
      PROMOTIONAL_SPAM_BRANDS_REGEX.test(`${msg.fromName || ''} ${msg.subject || ''}`)
    ) {
      return {
        categoryId: spamRule.id,
        rule: spamRule,
        matchedEntry: 'promotional marketing blast',
      };
    }

    const isTrustedSite = isOfficialPopularWebsiteEmail(fromAddr);
    const isOfficialInstOrGov = isOfficialInstitutionalOrGovEmail(fromAddr);

    if (msg.labelIds?.includes('SPAM') && !isTrustedSite) {
      return { categoryId: spamRule.id, rule: spamRule, matchedEntry: 'Gmail SPAM label' };
    }

    if (!isTrustedSite && !isOfficialInstOrGov) {
      const spamText = decodeHtmlEntities(
        `${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 500)}`
      );
      if (OBVIOUS_SPAM_SIGNAL_REGEX.test(spamText)) {
        return {
          categoryId: spamRule.id,
          rule: spamRule,
          matchedEntry: 'unauthorized reward/lottery/scam',
        };
      }
      if (UNAUTHORIZED_FAKE_OPPORTUNITY_SPAM_REGEX.test(spamText)) {
        return {
          categoryId: spamRule.id,
          rule: spamRule,
          matchedEntry: 'unauthorized internship/scholarship/reward',
        };
      }
    }
  }

  // 7. STRICT ACADEMIC (ONLY coursework, CIE/SEE, seating arrangements, syllabus, Google Classroom, MATLAB Grader, EL reviews, official academic circulars)
  if (academicRule) {
    // Inherently academic From: platforms (MATLAB Grader, Google Classroom)
    if (fromAddr) {
      const m = matchAddressAgainstRule(fromAddr, academicRule, false);
      if (m) return { categoryId: academicRule.id, rule: academicRule, matchedEntry: m };
    }
    if (hasStrictAcademicSignal(msg)) {
      return {
        categoryId: academicRule.id,
        rule: academicRule,
        matchedEntry: 'strict academic criteria',
      };
    }
  }

  // 8. Custom user-added rules (strictly From: address only)
  for (const rule of rules) {
    if (rule.isSystemDefault) continue;
    if (fromAddr) {
      const m = matchAddressAgainstRule(fromAddr, rule, false);
      if (m) return { categoryId: rule.id, rule, matchedEntry: m };
    }
  }

  return null;
}

/**
 * Fast-path check: official emails from popular legitimate websites (GitHub, LinkedIn,
 * Google, Amazon, Coursera, etc.) that did not match any deterministic campus/club/survey/
 * volunteering/spam rule can route directly to General Inbox in 0ms without burning API quota.
 */
export function canFastPathOfficialWebsiteToGeneral(
  msg: {
    fromName?: string;
    fromEmail?: string;
    subject?: string;
    snippet?: string;
    bodyText?: string;
  },
  rules: ClassificationRule[],
  feedbackExamples: TrainingFeedbackExample[] = []
): boolean {
  const fromAddr = extractEmailAddress(msg.fromEmail || '');
  if (!isOfficialPopularWebsiteEmail(fromAddr)) {
    return false;
  }

  if (
    hasClubSignal(msg) ||
    hasSurveySignal(msg) ||
    hasStrongVolunteeringSignal(msg.subject, msg.snippet, msg.bodyText) ||
    hasStrictAcademicSignal(msg) ||
    PROMOTIONAL_SPAM_BRANDS_REGEX.test(`${msg.fromName || ''} ${fromAddr} ${msg.subject || ''}`)
  ) {
    return false;
  }

  if (
    feedbackExamples.some((ex) => {
      const exAddr = extractEmailAddress(ex.fromEmail || '');
      return exAddr && exAddr === fromAddr;
    })
  ) {
    return false;
  }

  const customRules = rules.filter((r) => !r.isSystemDefault && r.keywords.length > 0);
  if (customRules.length > 0) {
    const combined = decodeHtmlEntities(
      `${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 400)}`
    ).toLowerCase();
    for (const rule of customRules) {
      if (rule.keywords.some((kw) => kw.trim() && combined.includes(kw.trim().toLowerCase()))) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Zero-cost local fallback classifier used automatically whenever GEMINI_API_KEY is
 * unconfigured or Gemini's free-tier quota is temporarily saturated across campus.
 */
export function classifyMessageLocallyFallback(
  msg: {
    fromName?: string;
    fromEmail?: string;
    subject?: string;
    snippet?: string;
    bodyText?: string;
    labelIds?: string[];
  },
  rules: ClassificationRule[],
  feedbackExamples: TrainingFeedbackExample[] = []
): MailClassification {
  const directMatch = matchMessageDeterministically(msg, rules);
  if (directMatch) {
    return {
      categoryId: directMatch.categoryId,
      confidence: 1.0,
      matchedBy: 'directory',
      reason: directMatch.rule
        ? `Matched ${directMatch.rule.shortName} (${directMatch.matchedEntry}).`
        : `Routed to General Inbox (${directMatch.matchedEntry}).`,
    };
  }

  const fromAddr = extractEmailAddress(msg.fromEmail || '');
  const isTrustedSite = isOfficialPopularWebsiteEmail(fromAddr);
  const isOfficialInst = isOfficialInstitutionalOrGovEmail(fromAddr);

  // Official popular websites route cleanly to General Inbox
  if (canFastPathOfficialWebsiteToGeneral(msg, rules, feedbackExamples)) {
    return {
      categoryId: 'general',
      confidence: 0.96,
      matchedBy: 'directory',
      reason: 'Official email from a popular website routed to General Inbox.',
    };
  }

  // Keyword match across active rules (respecting spam & academic strictness)
  const combined = decodeHtmlEntities(
    `${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 600)}`
  ).toLowerCase();
  for (const rule of rules) {
    if (rule.id === 'spam' && (isTrustedSite || isOfficialInst)) {
      continue;
    }
    if (rule.id === 'academic') {
      // Strict Academic already evaluated via hasStrictAcademicSignal above
      continue;
    }
    for (const rawKw of rule.keywords) {
      const kw = rawKw.trim().toLowerCase();
      if (kw.length < 3) continue;
      if (combined.includes(kw)) {
        return {
          categoryId: rule.id,
          confidence: 0.85,
          matchedBy: 'directory',
          reason: `Matched ${rule.shortName} keyword "${kw}".`,
        };
      }
    }
  }

  return {
    categoryId: 'general',
    confidence: 0.78,
    matchedBy: 'directory',
    reason: 'Routed to General Inbox.',
  };
}

/**
 * Local fallback parser for natural-language training orders when Gemini free-tier quota
 * is unavailable or unconfigured.
 */
export function parseTrainingOrderLocallyFallback(
  instruction: string,
  existingRules: ClassificationRule[]
): {
  action: 'update_existing' | 'create_new';
  targetRuleId: string;
  name: string;
  shortName: string;
  description: string;
  senders: string[];
  keywords: string[];
  useAiSemantics: boolean;
} {
  const cleaned = instruction.trim();
  const lower = cleaned.toLowerCase();

  const emailMatches = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const senders = Array.from(new Set(emailMatches.map((e) => e.toLowerCase())));

  const quotedKeywords: string[] = [];
  const quoteRegex = /["']([^"']{2,48})["']/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = quoteRegex.exec(cleaned)) !== null) {
    if (qMatch[1]) quotedKeywords.push(qMatch[1].trim().toLowerCase());
  }

  const matchedExisting = existingRules.find(
    (r) =>
      lower.includes(r.name.toLowerCase()) ||
      lower.includes(r.shortName.toLowerCase()) ||
      lower.includes(r.id.toLowerCase())
  );

  if (matchedExisting) {
    return {
      action: 'update_existing',
      targetRuleId: matchedExisting.id,
      name: matchedExisting.name,
      shortName: matchedExisting.shortName,
      description: matchedExisting.description,
      senders,
      keywords: Array.from(new Set(quotedKeywords)),
      useAiSemantics: true,
    };
  }

  const labelMatch =
    cleaned.match(/(?:called|named|to|into|box|mailbox|folder|category)\s+["']?([a-zA-Z0-9 &/-]{2,32})["']?/i);
  const rawName = (labelMatch?.[1] || 'CUSTOM MAILS').trim();
  const shortName = rawName.replace(/\s+mails?$/i, '').trim() || 'Custom';
  const name = rawName.toUpperCase();
  const targetRuleId =
    shortName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'custom';

  return {
    action: 'create_new',
    targetRuleId,
    name,
    shortName,
    description: cleaned.slice(0, 160),
    senders,
    keywords: Array.from(new Set(quotedKeywords.length > 0 ? quotedKeywords : [shortName.toLowerCase()])),
    useAiSemantics: true,
  };
}

/**
 * Legacy helper kept for compatibility; delegates to matchMessageDeterministically.
 */
export function matchSenderToRule(
  fromEmail: string,
  rules: ClassificationRule[]
): DeterministicMatchResult | null {
  return matchMessageDeterministically({ fromEmail }, rules);
}
