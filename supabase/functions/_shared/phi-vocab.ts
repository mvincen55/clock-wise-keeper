// phi-vocab — word lists behind the name heuristic in phi-scrub.
//
// Two jobs, pulling in opposite directions:
//   * NON_NAME_WORDS / PLACE_PREFIXES / STATES say when a run of capitalised
//     words is NOT a person: a carrier ("Delta Dental"), a manual section
//     ("Timely Filing"), a city or state ("Salt Lake City", "North Carolina").
//     Without them every such phrase became "[a person]" and the AI could not
//     name the carrier whose manual it had just read.
//   * FIRST_NAMES / SURNAMES say when a pair of words IS a person even when
//     typed in lower case or ALL CAPS ("call sarah johnson", "DOE, JANE"),
//     which the capitalisation rule alone can never see.
//
// Homographs are kept out of the name lists on purpose: "will", "may",
// "page", "white" and friends are ordinary words far more often than names,
// and a lower-case match on them would mangle normal sentences. A surname
// that is also a word ("white", "hill") is only honoured right after a known
// first name — see SURNAME_HOMOGRAPHS.

const words = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

/** US states, territories and their usual abbreviations' spelled forms. */
export const STATES = words(`
alabama alaska arizona arkansas california colorado connecticut delaware florida
georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland
massachusetts michigan minnesota mississippi missouri montana nebraska nevada
hampshire jersey mexico york carolina dakota ohio oklahoma oregon pennsylvania
rhode island tennessee texas utah vermont virginia washington wisconsin wyoming
columbia puerto rico guam samoa
`);

/**
 * Leading words that mark a place name ("San Diego", "Fort Worth",
 * "New Bedford", "Lake Forest"). Only honoured at the START of a run.
 */
export const PLACE_PREFIXES = words(`
los las san santa saint st fort ft mount mt port new north south east west
upper lower cape el la del grand great little big palm long lake bay old salt
`);

/**
 * Ordinary vocabulary that shows up capitalised inside carrier names, manual
 * sections, document titles, addresses and office phrases. A capitalised run
 * containing any of these is a phrase, not a person. Colour, nature and
 * other common-surname homographs ("White", "Hill", "Rose") are deliberately
 * NOT here.
 */
export const NON_NAME_WORDS = words(`
dental dentistry dentist dentists orthodontic orthodontics periodontal endodontic
oral surgery surgical hygiene hygienist prophy perio implant implants crown crowns
bridge bridges denture dentures veneer veneers filling fillings composite amalgam
extraction extractions root canal sealant sealants fluoride xray xrays radiograph
radiographs bitewing bitewings panoramic fmx bwx exam exams evaluation cleaning
whitening nightguard occlusal scaling planing

insurance insurer insurers carrier carriers plan plans policy policies benefit
benefits coverage covered claim claims claimant filing filed timely limit limits
limitation limitations frequency exclusion exclusions deductible deductibles
maximum maximums annual lifetime copay copayment coinsurance eligibility
eligible member members subscriber subscribers dependent dependents network
networks ppo hmo dhmo epo indemnity premium premiums predetermination
preauthorization prior authorization pre-authorization pre-treatment
pretreatment estimate estimates narrative narratives downgrade downgrades
alternate alternative least expensive missing tooth clause waiting period
coordination cob primary secondary payer payor payers assignment appeal appeals
denial denials denied remittance eob eobs explanation reimbursement allowable
allowed fee fees schedule schedules ucr contracted participating
non-participating provider providers portal clearinghouse electronic paper
processing processed guidelines guideline handbook manual manuals reference
references bulletin bulletins update updates notice notices effective

blue cross shield delta aetna cigna metlife guardian humana anthem ameritas
principal united healthcare concordia careington dentaquest dentemax lincoln
financial sun life assurant renaissance liberty mutual equitable unum
masshealth medicaid medicare tricare chip

office offices front desk reception practice practices patient patients
treatment plans doctor doctors hygienists assistant assistants coordinator
coordinators manager managers team staff clinical clerical billing collections
production scheduling schedule appointment appointments recall recalls
confirmation confirmations checklist checklists payroll timesheet timecard
deposit deposits invoice invoices statement statements balance balances
payment payments financial options form forms template templates letter
letters envelope policy procedure procedures protocol protocols training
module modules library knowledge document documents section sections chapter
chapters appendix part parts page pages table tables figure exhibit form index
glossary summary overview introduction contents definitions requirements
general information instructions

code codes cdt ada hipaa phi npi tin ein

street avenue boulevard road drive suite building floor city county state
center centre plaza square park station airport hospital clinic university
college school district region county township village

monday tuesday wednesday thursday friday saturday sunday january february
march april may june july august september october november december
morning afternoon evening daily weekly monthly quarterly yearly
day days week weeks month months year years time hours minutes today tomorrow
yesterday holiday holidays closure closures closed open opening
lake river valley harbor harbour beach ridge springs heights falls
`);

/**
 * Common given names. Names that are also everyday words (will, may, june,
 * mark, bill, pat, sue, art, chase, dawn, eve, guy, hope, grace, joy, lane,
 * page, ray, rose, sky, van, wade, ...) are left out.
 */
export const FIRST_NAMES = words(`
james john robert michael william mike tom jim dave chris steve matt nick tony ben sam dan greg jeff rick ron ken tim ted jen liz kate beth meg nate david richard joseph thomas charles
christopher daniel matthew anthony donald steven paul andrew joshua kenneth
kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas
eric jonathan stephen larry justin scott brandon benjamin samuel gregory
alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan
henry douglas zachary peter kyle noah ethan jeremy walter christian keith roger
terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan
billy bruce gabriel joe logan albert willie alan eugene randy vincent russell
elijah louis bobby philip johnny bradley cody caleb ralph isaac mason jimmy
curtis dale alex jared leonard hunter marcus elliot victor ricardo miguel
carlos luis juan jorge pedro francisco alejandro manuel fernando sergio rafael
eduardo roberto javier ramon ruben hector mario oscar omar cesar diego andres
ivan adrian julio enrique gustavo raul salvador armando felipe arturo ernesto
rodrigo angel mohammed ahmed ali hassan omar amir tariq kwame kofi

jane mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa
nancy betty margaret sandra ashley kimberly emily donna michelle carol amanda
dorothy melissa deborah stephanie rebecca sharon laura cynthia kathleen amy
angela shirley anna brenda pamela emma nicole helen samantha katherine
christine debra rachel carolyn janet catherine maria heather diane ruth julie
olivia joyce virginia victoria kelly lauren christina joan evelyn judith megan
andrea cheryl hannah jacqueline martha gloria teresa ann sara madison frances
kathryn janice jean abigail alice judy sophia marie denise amber doris marilyn
danielle beverly isabella theresa diana natalie brittany charlotte marissa
kayla alexis lori tiffany julia ashlee courtney erin erica chelsea monica
stacy stacey tracy tara vanessa veronica wendy whitney yolanda zoe alyssa
allison bethany brooke caitlin cassandra claire colleen crystal dana desiree
elaine ellen gabriela gina haley jenna jill jocelyn kara kari kristen kristin
krista leah lindsay lindsey lorraine mackenzie maggie mallory mandy marcia
meghan melanie meredith miranda molly nina paige peggy priscilla regina renee
rhonda robin rosa sabrina shannon sheila shelby sherry sonia sylvia tamara
tanya tasha valerie yvonne carmen lucia elena marisol guadalupe isabel
adriana alejandra beatriz daniela fernanda gabriella juana leticia lourdes
margarita mariana marta mercedes paola patricia pilar rocio rosario silvia
xiomara yesenia fatima aisha amina layla nadia priya anjali deepa kavya neha
`);

/**
 * Common surnames that are not also everyday words. Any-case "first last"
 * pairs built from FIRST_NAMES and this list are redacted outright.
 */
export const SURNAMES = words(`
smith johnson williams jones garcia miller davis rodriguez martinez hernandez
lopez gonzalez gonzales wilson anderson taylor moore jackson martin lee perez
thompson harris sanchez clark ramirez lewis robinson walker allen wright scott
torres nguyen flores adams nelson baker hall rivera campbell mitchell carter
roberts gomez phillips evans turner diaz parker cruz edwards collins reyes
stewart morris morales murphy cook rogers gutierrez ortiz morgan cooper
peterson bailey reed kelly howard ramos kim cox ward richardson watson brooks
chavez bennett gray mendoza ruiz hughes alvarez castillo sanders patel myers
ross foster jimenez powell jenkins perry russell sullivan coleman butler
henderson barnes fisher vasquez simmons romero patterson hamilton graham
reynolds griffin wallace moreno cole hayes bryant herrera gibson ellis tran
medina aguilar stevens murray castro marshall owens harrison fernandez
mcdonald woods kennedy wells vargas chen freeman webb tucker guzman burns
crawford olson simpson porter gordon mendez silva shaw snyder dixon munoz
hicks holmes palmer wagner robertson boyd salazar warren mills meyer rice
schmidt garza daniels ferguson nichols stephens soto weaver gardner payne
dunn kelley spencer hawkins arnold pierce vazquez hansen peters santos hart
knight elliott cunningham duncan armstrong hudson carroll riley andrews
alvarado delgado perkins hoffman johnston matthews pena richards contreras
willis carpenter sandoval guerrero chapman rios estrada ortega watkins greene
nunez wheeler valdez harper burke larson santiago maldonado morrison carlson
dominguez carr lawson jacobs obrien lynch singh vega bishop montgomery
jensen harvey williamson sims espinoza howell wong reid hanson mccoy garrett
burton fuller wang weber welch rojas marquez yang padilla walsh bowman
schultz luna fowler mejia davidson acosta brewer holland juarez newman
pearson cortez schneider barrett navarro figueroa keller avila molina
stanley hopkins campos barnett bates chambers caldwell beck lambert byrd
craig ayala lowe frazier powers neal carrillo sutton fleming rhodes shelton
schwartz norris jennings watts duran walters cohen mcdaniel moran parks
steele vaughn becker holt deleon barker hale benson haynes horton lyons pham
graves thornton wolfe warner cabrera mckinney zimmerman dawson lara fletcher
mccarthy robles cervantes solis erickson reeves chang klein salinas fuentes
baldwin velasquez hardy higgins aguirre lin cummings chandler barber bowen
ochoa robbins liu ramsey griffith blair oconnor cardenas pacheco calderon
quinn swanson chan rivas khan rodgers serrano fitzgerald rosales stevenson
christensen manning gill curry mclaughlin harmon mcgee doyle garner newton
burgess reese walton trujillo adkins brady goodman webster goodwin fischer
huang potter delacruz montoya wu hines mullins castaneda malone cannon mack
sherman hubbard hodges zhang guerra valencia saunders franco rowe gallagher
hammond hampton townsend ingram gallegos clarke barton schroeder maxwell
waters camacho strickland colon parsons harrington glover osborne buchanan
casey patton ibarra suarez bowers orozco salas cobb gibbs andrade bauer
conner moody escobar mcguire lloyd mueller hartman kramer mcbride lindsey
velazquez norton mccormick sparks flynn yates hogan macias villanueva zamora
pratt stokes ballard lang brock villarreal drake barrera cain pineda burnett
mercado santana shepherd bautista shaffer lamb trevino mckenzie hess olsen
cochran morton nash wilkins petersen briggs shah roth nicholson holloway
lozano rangel hoover arias mora valenzuela meyers weiss underwood bass greer
summers houston morrow clayton whitaker decker yoder collier zuniga carey
wilcox melendez poole roberson larsen conley davenport copeland massey lam
huff rocha cameron hood monroe pittman huynh randall singleton combs mathis
skinner bradford galvan boone kirby wilkinson bridges atkinson velez meza
hodge villa abbott tapia sosa sweeney farrell wyatt dalton barron phelps
dickerson heath foley atkins bonilla acevedo benitez zavala hensley cisneros
harrell shields rubio choi huffman boyer garrison arroyo kane hancock
callahan dillon cline wiggins grimes arellano melton oneill savage beltran
pitts parrish ponce koch ware brennan mcdowell cantu humphrey baxter sawyer
tanner hutchinson kaur berg wiley gilmore russo villegas hobbs wilkerson
ahmed beard mcclain montes mata vang henson oneal mosley mcclure beasley
stephenson huerta vance johns eaton blackwell dyer macdonald solomon guevara
stafford hurst woodard cortes kemp nolan mccullough merritt murillo salgado
kline cordova wolff barajas nava carrasco pruitt dudley hurley valdes byers
castellanos whitman doe roe alvarenga okafor nakamura tanaka suzuki kobayashi sato
yamamoto watanabe ito kato yoshida kimura ortiz-lopez
`);

/**
 * Surnames that double as everyday words. Honoured only immediately after a
 * known first name ("sarah white" yes, "Snow Day" no).
 */
export const SURNAME_HOMOGRAPHS = words(`
white young king hill green brown rose stone fox wolf bush snow moon long
little short rich strong love bell ford park price cross fields wood west
lane gates berry day may page ball wall person wise sharp hail bond booth
golden moss black gray grey burns banks bishop rowe rock hunt hunter mason
cook baker fisher carpenter weaver farmer brewer barber knight bird sparrow
rivers brooks lake marsh forest field hay mills mill storm winter summers
frost flowers bloom bliss best good sweet small savage noble joy
`);
