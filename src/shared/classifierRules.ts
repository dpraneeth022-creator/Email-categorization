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
      'Campus club notices, student club inductions, recruitments, workshops, meetings, and emails containing the word club or clubs — always kept separate from Academic Mails.',
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
      'Official communications from RVCE faculty, HODs, Deans, Principal, COE, Placement cell, CTTO First Year, department mailing lists (@rvce.edu.in / @rvei.edu.in), RSST engineering offices, and MathWorks MATLAB Grader.',
    accent: 'blue',
    senders: [
      ...RVCE_ACADEMIC_SENDERS,
      'rvce.edu.in',
      'rvei.edu.in',
    ],
    keywords: [
      'rvce',
      'mathworks grader',
      'matlab grader',
      'cie schedule',
      'see examination',
      'rvce academic',
      'placement cell',
      'first year ctto',
      'timetable',
      'lab manual',
      'internal assessment',
      'google classroom',
    ],
    useAiSemantics: true,
    isSystemDefault: true,
  },
  {
    id: 'spam',
    name: 'SPAM MAILS',
    shortName: 'Spam',
    description:
      'Fake internships, rewards and lottery claims, unauthorized scholarship blasts, phishing, and scams sent from unauthorized or unverified senders — while official emails from popular websites stay in General Inbox.',
    accent: 'rose',
    senders: [],
    keywords: [
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
    const cleaned = angleMatch[1].replace(/^["'\s]+|["'\s]+$/g, '');
    if (cleaned.length > 0) return cleaned;
  }
  const email = extractEmailAddress(rawFrom);
  const local = email.split('@')[0] || rawFrom;
  return local;
}

/**
 * Extracts all candidate sender emails from a message, including Reply-To,
 * X-Original-Sender (Google Groups), and forwarded "From:" headers in the body.
 */
export function extractCandidateSenders(input: {
  fromEmail?: string;
  replyTo?: string;
  originalSender?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): string[] {
  const found = new Set<string>();
  const addRaw = (val?: string) => {
    if (!val) return;
    const matches = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      for (const m of matches) found.add(m.toLowerCase());
    } else {
      const cleaned = extractEmailAddress(val);
      if (cleaned) found.add(cleaned);
    }
  };

  addRaw(input.fromEmail);
  addRaw(input.replyTo);
  addRaw(input.originalSender);

  // If forwarded email, inspect leading forwarded From/Sender header lines in body
  const headText = (input.bodyText || input.snippet || '').slice(0, 800);
  const forwardedFromRegex = /(?:^|\n)\s*(?:from|sender|reply-to)\s*:\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = forwardedFromRegex.exec(headText)) !== null) {
    addRaw(match[1]);
  }

  return Array.from(found);
}

const VOLUNTEERING_SIGNAL_REGEX =
  /\b(volunteering|volunteer|volunteers|nss|ncc|blood\s+donation|cleanliness\s+drive|swachh\s+bharat|plantation\s+drive|community\s+service|social\s+outreach|rotaract|youth\s+red\s+cross|relief\s+camp|charity\s+drive|ngo\b|donation\s+camp|civic\s+service)\b/i;

const CLUB_WORD_REGEX = /\bclubs?\b/i;

const SURVEY_SIGNAL_REGEX =
  /\b(surveys?|questionnaires?|feedback\s+forms?|course\s+feedback|student\s+feedback|campus\s+poll|opinion\s+poll|surveymonkey|qualtrics|typeform)\b/i;

export function hasStrongVolunteeringSignal(subject?: string, snippet?: string, bodyText?: string): boolean {
  const combined = `${subject || ''} ${snippet || ''} ${(bodyText || '').slice(0, 500)}`;
  return VOLUNTEERING_SIGNAL_REGEX.test(combined);
}

export function hasSurveySignal(input: {
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  originalSender?: string;
  to?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  const textCombined = `${input.fromName || ''} ${input.subject || ''} ${input.snippet || ''} ${(
    input.bodyText || ''
  ).slice(0, 1200)}`;
  if (SURVEY_SIGNAL_REGEX.test(textCombined)) {
    return true;
  }

  const addrFields = [input.fromEmail, input.replyTo, input.originalSender, input.to];
  for (const field of addrFields) {
    if (!field) continue;
    const matches = field.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
    if (matches) {
      for (const addr of matches) {
        const localPart = addr.split('@')[0] || '';
        if (localPart.includes('survey')) {
          return true;
        }
      }
    }
  }

  return false;
}

export function hasClubSignal(input: {
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  originalSender?: string;
  to?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
}): boolean {
  const textCombined = `${input.fromName || ''} ${input.subject || ''} ${input.snippet || ''} ${(
    input.bodyText || ''
  ).slice(0, 1200)}`;
  if (CLUB_WORD_REGEX.test(textCombined)) {
    return true;
  }

  // Also detect campus club email addresses like codingclub@rvce.edu.in or dramaclub@rvce.edu.in
  const addrFields = [input.fromEmail, input.replyTo, input.originalSender, input.to];
  for (const field of addrFields) {
    if (!field) continue;
    const matches = field.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
    if (matches) {
      for (const addr of matches) {
        const localPart = addr.split('@')[0] || '';
        if (localPart.includes('club')) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Matches a single email address against exact entries or domain entries in a rule.
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
      if (
        domainPart === entry ||
        domainPart.endsWith(`.${entry}`) ||
        normalizedEmail.includes(entry)
      ) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Official domains of popular, legitimate websites and platforms.
 * Emails from these official domains go to General Inbox (not Spam), unless
 * matched to a dedicated campus category (Volunteering, Surveys, Clubs, Academic).
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

/**
 * Deterministic sender/domain matcher with full support for:
 * 1. Exact Volunteering senders (nss@rvce.edu.in, nccrvce@rvce.edu.in) — highest priority
 * 2. Surveys (survey/questionnaire/feedback forms) — always separated from Academic Mails
 * 3. Clubs (word "club"/"clubs" or club sender addresses) — always separated from Academic Mails
 * 4. Exact listed Academic, Spam & Custom senders across From, Reply-To, X-Original-Sender, and forwarded headers
 * 5. Institutional domain matches (mail.grader.mathworks.com, rvce.edu.in, rvei.edu.in) and RVCE mailing list To: headers
 * 6. Unauthorized spam (fake internships, rewards & lottery, unauthorized scholarships, scams, Gmail SPAM) — while protecting official emails from popular websites
 */
export function matchMessageDeterministically(
  msg: {
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    originalSender?: string;
    to?: string;
    subject?: string;
    snippet?: string;
    bodyText?: string;
    labelIds?: string[];
  },
  rules: ClassificationRule[]
): { rule: ClassificationRule; matchedEntry: string } | null {
  const candidates = extractCandidateSenders(msg);
  const hasVolSignal = hasStrongVolunteeringSignal(msg.subject, msg.snippet, msg.bodyText);
  const hasSurveyWord = hasSurveySignal(msg);
  const hasClubWord = hasClubSignal(msg);

  const volunteeringRule = rules.find((r) => r.id === 'volunteering');
  const surveysRule = rules.find((r) => r.id === 'surveys');
  const clubsRule = rules.find((r) => r.id === 'clubs');
  const academicRule = rules.find((r) => r.id === 'academic');
  const spamRule = rules.find((r) => r.id === 'spam');

  // 1. Exact Volunteering senders ALWAYS win first (nss@rvce.edu.in, nccrvce@rvce.edu.in)
  if (volunteeringRule) {
    for (const addr of candidates) {
      const m = matchAddressAgainstRule(addr, volunteeringRule, false);
      if (m) return { rule: volunteeringRule, matchedEntry: m };
    }
  }

  // 2. Survey emails ALWAYS route to SURVEYS, separated from ACADEMIC MAILS
  if (surveysRule) {
    for (const addr of candidates) {
      const m = matchAddressAgainstRule(addr, surveysRule, false);
      if (m) return { rule: surveysRule, matchedEntry: m };
    }
    if (hasSurveyWord) {
      return { rule: surveysRule, matchedEntry: 'keyword "survey"' };
    }
  }

  // 3. Club emails (containing the word "club"/"clubs" or club sender addresses) ALWAYS route to CLUBS, never ACADEMIC MAILS
  if (clubsRule) {
    for (const addr of candidates) {
      const m = matchAddressAgainstRule(addr, clubsRule, false);
      if (m) return { rule: clubsRule, matchedEntry: m };
    }
    if (hasClubWord) {
      return { rule: clubsRule, matchedEntry: 'keyword "club"' };
    }
  }

  // 4. Exact email matches for Custom rules, Spam blocklist & Academic faculty directory
  for (const rule of rules) {
    if (rule.id === 'volunteering' || rule.id === 'surveys' || rule.id === 'clubs') continue;
    for (const addr of candidates) {
      const m = matchAddressAgainstRule(addr, rule, true);
      if (m) {
        // If a faculty/RVCE sender explicitly sends a volunteering call, let Gemini route it to VOLUNTEERING MAILS
        if (rule.id === 'academic' && hasVolSignal) {
          return null;
        }
        return { rule, matchedEntry: m };
      }
    }
  }

  // 5. Domain-level matches (e.g. mail.grader.mathworks.com, rvce.edu.in, rvei.edu.in, or user-added spam domains)
  for (const rule of rules) {
    if (rule.id === 'volunteering' || rule.id === 'surveys' || rule.id === 'clubs') continue;
    for (const addr of candidates) {
      const m = matchAddressAgainstRule(addr, rule, false);
      if (m) {
        if (rule.id === 'academic' && hasVolSignal) {
          return null;
        }
        return { rule, matchedEntry: m };
      }
    }
  }

  // 6. Institutional Google Group mailing lists in To: header (e.g. To: ec2026@rvce.edu.in)
  if (academicRule && !hasVolSignal && !hasSurveyWord && !hasClubWord && msg.to) {
    const toLower = msg.to.toLowerCase();
    if (toLower.includes('@rvce.edu.in') || toLower.includes('@rvei.edu.in')) {
      const subjectAndSnippet = `${msg.subject || ''} ${msg.snippet || ''}`;
      if (
        /\b(rvce|rvei|cie\b|see\s+exam|timetable|assignment|placement|circular|matlab|semester|syllabus|lab\s+manual|google\s+classroom|hod|dean|ctto)\b/i.test(
          subjectAndSnippet
        )
      ) {
        return { rule: academicRule, matchedEntry: 'rvce.edu.in campus notice' };
      }
    }
  }

  // 7. Spam from unauthorized senders (fake internships, rewards/lottery, unauthorized scholarships, scams, Gmail SPAM)
  // Official emails from popular websites or verified .edu/.ac.in/.gov.in domains are protected from false spam tagging.
  if (spamRule) {
    const isTrustedSite = candidates.some((addr) => isOfficialPopularWebsiteEmail(addr));
    const isOfficialInstOrGov = candidates.some((addr) => isOfficialInstitutionalOrGovEmail(addr));

    if (msg.labelIds?.includes('SPAM') && !isTrustedSite) {
      return { rule: spamRule, matchedEntry: 'Gmail SPAM label' };
    }

    if (!isTrustedSite && !isOfficialInstOrGov) {
      const spamText = `${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 500)}`;
      if (OBVIOUS_SPAM_SIGNAL_REGEX.test(spamText)) {
        return { rule: spamRule, matchedEntry: 'unauthorized reward/lottery/scam' };
      }
      if (UNAUTHORIZED_FAKE_OPPORTUNITY_SPAM_REGEX.test(spamText)) {
        return { rule: spamRule, matchedEntry: 'unauthorized internship/scholarship/reward' };
      }
    }
  }

  return null;
}

/**
 * Fast-path check: official emails from popular legitimate websites (GitHub, LinkedIn,
 * Google, Amazon, Coursera, etc.) that did not match any deterministic campus/club/survey/
 * volunteering rule and have no custom rule or feedback override can route directly to
 * General Inbox in 0ms without consuming Gemini API quota.
 */
export function canFastPathOfficialWebsiteToGeneral(
  msg: {
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    originalSender?: string;
    subject?: string;
    snippet?: string;
    bodyText?: string;
  },
  rules: ClassificationRule[],
  feedbackExamples: TrainingFeedbackExample[] = []
): boolean {
  const candidates = extractCandidateSenders(msg);
  if (!candidates.some((addr) => isOfficialPopularWebsiteEmail(addr))) {
    return false;
  }

  // Never fast-path if the email has strong volunteering/survey/club signals
  if (
    hasStrongVolunteeringSignal(msg.subject, msg.snippet, msg.bodyText) ||
    hasSurveySignal(msg) ||
    hasClubSignal(msg)
  ) {
    return false;
  }

  // Respect any user-corrected training example for this sender
  const lowerCandidates = new Set(candidates.map((c) => c.toLowerCase()));
  if (
    feedbackExamples.some((ex) => {
      const exAddr = extractEmailAddress(ex.fromEmail || '');
      return exAddr && lowerCandidates.has(exAddr);
    })
  ) {
    return false;
  }

  // Respect any custom user-created rule keywords
  const customRules = rules.filter((r) => !r.isSystemDefault && r.keywords.length > 0);
  if (customRules.length > 0) {
    const combined = `${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 400)}`.toLowerCase();
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
 * Guarantees uninterrupted free sorting for all students and faculty.
 */
export function classifyMessageLocallyFallback(
  msg: {
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    originalSender?: string;
    to?: string;
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
      categoryId: directMatch.rule.id,
      confidence: 1.0,
      matchedBy: 'directory',
      reason: `Matched trained ${directMatch.rule.shortName} rule (${directMatch.matchedEntry}).`,
    };
  }

  const candidates = extractCandidateSenders(msg);
  const lowerCandidates = new Set(candidates.map((c) => c.toLowerCase()));
  const isTrustedSite = candidates.some((addr) => isOfficialPopularWebsiteEmail(addr));
  const isOfficialInst = candidates.some((addr) => isOfficialInstitutionalOrGovEmail(addr));

  // 1. Honor explicit user feedback examples for the same sender
  for (let i = feedbackExamples.length - 1; i >= 0; i--) {
    const ex = feedbackExamples[i];
    const exAddr = extractEmailAddress(ex.fromEmail || '');
    if (exAddr && lowerCandidates.has(exAddr)) {
      const targetExists =
        ex.assignedCategoryId === 'general' ||
        rules.some((r) => r.id === ex.assignedCategoryId);
      if (targetExists) {
        return {
          categoryId: ex.assignedCategoryId,
          confidence: 0.92,
          matchedBy: 'directory',
          reason: 'Matched previous user-corrected sender feedback.',
        };
      }
    }
  }

  // 2. Volunteering semantic fallback
  const volunteeringRule = rules.find((r) => r.id === 'volunteering');
  if (volunteeringRule && hasStrongVolunteeringSignal(msg.subject, msg.snippet, msg.bodyText)) {
    return {
      categoryId: volunteeringRule.id,
      confidence: 0.88,
      matchedBy: 'directory',
      reason: 'Matched volunteering and community outreach keywords.',
    };
  }

  // 3. Official popular websites always route cleanly to General Inbox
  if (canFastPathOfficialWebsiteToGeneral(msg, rules, feedbackExamples)) {
    return {
      categoryId: 'general',
      confidence: 0.95,
      matchedBy: 'directory',
      reason: 'Official email from a popular website routed to General Inbox.',
    };
  }

  // 4. Keyword match across active rules (protecting trusted/official domains from Spam)
  const combined = `${msg.subject || ''} ${msg.snippet || ''} ${(msg.bodyText || '').slice(0, 600)}`.toLowerCase();
  for (const rule of rules) {
    if (rule.id === 'spam' && (isTrustedSite || isOfficialInst)) {
      continue;
    }
    for (const rawKw of rule.keywords) {
      const kw = rawKw.trim().toLowerCase();
      if (kw.length < 3) continue;
      if (combined.includes(kw)) {
        return {
          categoryId: rule.id,
          confidence: 0.82,
          matchedBy: 'directory',
          reason: `Matched ${rule.shortName} keyword "${kw}".`,
        };
      }
    }
  }

  return {
    categoryId: 'general',
    confidence: 0.72,
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

  // Extract emails and domains mentioned in the prompt
  const emailMatches = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const senders = Array.from(new Set(emailMatches.map((e) => e.toLowerCase())));

  // Extract quoted phrases as keywords
  const quotedKeywords: string[] = [];
  const quoteRegex = /["']([^"']{2,48})["']/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = quoteRegex.exec(cleaned)) !== null) {
    if (qMatch[1]) quotedKeywords.push(qMatch[1].trim().toLowerCase());
  }

  // Detect if targeting an existing mailbox
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
  const targetRuleId = shortName
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
): { rule: ClassificationRule; matchedEntry: string } | null {
  return matchMessageDeterministically({ fromEmail }, rules);
}
