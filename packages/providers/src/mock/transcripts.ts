// Pre-written mock transcripts for the 20 scripted demo calls, keyed by
// scripted-call id. Each transcript is written to justify its fixture
// scorecard (summary + five rubric steps), so the demo AI pipeline is
// coherent end to end without any external API.

import { pick, type Rng } from "./prng";
import type { RubricSteps } from "./fixtures";

export const SCRIPTED_TRANSCRIPTS: Record<string, string> = {
  // ---------------- Marcus Ferreira ----------------
  "marcus-1": `Agent: Anchorline Insurance, this is Marcus. You called about an auto quote?
Customer: Yes, hi. I'm shopping around for my two cars.
Agent: Sure. For two vehicles you're looking at $148 a month on our standard tier, $121 if you take the higher deductible. That's with our carrier's July rates.
Customer: Oh — okay, that was fast. Does that include roadside assistance? My current policy has it.
Agent: That tier doesn't, no. So which of those two numbers works better for you?
Customer: I'm not sure. What are you actually covering there? I have an accident from 2024 I should probably mention.
Agent: The system will catch that at binding. So do you want me to write it up at $148?
Customer: I think I need time to compare this against what I have. It's hard to tell what's included.
Agent: I can hold this rate until Friday. Should I call you Thursday to close it out?
Customer: Maybe. Send me the details in writing first.
Agent: Will do. Thanks.`,

  "marcus-2": `Agent: This is Marcus at Anchorline, returning your quote request.
Customer: Hi, yes — for my Silverado.
Agent: Great. Single truck, state minimums, you're at $96 a month. Full coverage puts you at $164.
Customer: That's higher than I hoped. I've had a clean record for ten years, does that count for anything?
Agent: That's already baked in. $96 or $164, those are the numbers.
Customer: What about bundling? My wife mentioned we could move the house too.
Agent: We can look at that some other time — home quotes take longer. On the truck, want me to lock in the $96?
Customer: I guess let me think about it.
Agent: Sure. The rate could change next month, just so you know. Want me to pencil you in for full coverage?
Customer: Send me both numbers by email.
Agent: Done. Talk soon.`,

  "marcus-3": `Agent: Hey, is this Danielle? Marcus from Anchorline. How's your week going?
Customer: Not bad, thanks — busy with the kids' camp schedule.
Agent: I hear that, mine start camp Monday. So, you asked about home insurance for the new place on Fairmount?
Customer: Yes, we close in three weeks.
Agent: Congrats! Okay, for that address I've got you at $1,840 a year with a $2,500 deductible through Safeco.
Customer: Hmm. Our lender estimated something like $1,500 in escrow. That's a real jump.
Agent: Rates have moved a lot this year, that's pretty normal. It's a solid policy.
Customer: Is there anything that would bring it down? Alarm discounts, higher deductible, anything?
Agent: The $2,500 deductible is already the discounted setup. So should I get this bound before your closing date?
Customer: Let me talk to my husband about the price first.
Agent: Sure — I'll call you Thursday and we can wrap it up then?
Customer: Okay, Thursday works.`,

  "marcus-4": `Agent: Marcus with Anchorline about the auto quote you requested online.
Customer: Oh, right, yes.
Agent: So we've got three tiers. Basic is $88 a month, standard is $112, and our premier tier is $139. Standard is what most people take.
Customer: Uh — sorry, this is for both drivers on the account?
Agent: It's for the vehicle on the form. Premier adds rental car coverage and glass.
Customer: Right, but my son is on my current policy, he's 19. Does that change these numbers?
Agent: We'd have to add him later. So of those three, where do you want to land?
Customer: Honestly I'm not following what these tiers cover. Can you call me back another time? I'm heading into a meeting.
Agent: Sure, I'll try you tomorrow.
Customer: Fine, thanks.`,

  // ---------------- Priya Nandakumar ----------------
  "priya-1": `Agent: Hi Robert, it's Priya at Anchorline — we spoke briefly at the Rotary breakfast last month. How did your daughter's graduation go?
Customer: Priya, hi! It was wonderful, thanks for remembering. She's off to Ann Arbor in the fall.
Agent: That's exciting — and it actually matters for what we're doing today. Walk me through what you have now: cars, the house, anything else on the books?
Customer: Two cars, the house on Linden, and my wife has a small pottery studio she sells from.
Agent: Perfect. Who's driving what, and is your daughter taking a car to Michigan?
Customer: She is — the Civic. The other is my truck. Studio's insured through some rider we added years ago.
Agent: Got it. A student away over 100 miles can earn a distant-student discount on the Civic. And that studio rider likely caps business property at $2,500 — is her inventory worth more than that around the holidays?
Customer: Definitely, probably $8,000 before craft fair season.
Agent: Then here's what I'd do: auto for both vehicles with the student discount at $214 a month, home at $1,610 a year, and a proper in-home business endorsement for the studio. Bundled you'd save about $400 a year versus what you described.
Customer: The deductible on the home — $2,500 feels high. We had a $1,000 with our old carrier.
Agent: Fair concern. The $1,000 option costs $180 more per year — you'd be paying $180 annually to protect against a $1,500 swing you might use once a decade. Most families your profile keep the $2,500 and bank the difference. Either way, you choose.
Customer: When you put it that way, keep the $2,500.
Agent: Great. Can I get your go-ahead to bind all three effective the first, and I'll send documents tonight?
Customer: Yes, let's do it.`,

  "priya-2": `Agent: Hi Elaine, Priya from Anchorline. Thanks for making time — how's the new job treating you?
Customer: Busy but good! The commute's shorter, which I love.
Agent: Glad to hear it. Before we look at numbers, let me understand the whole picture. You mentioned an auto quote — what else do you carry, and with whom?
Customer: Cars with Geico, house with Travelers, and that's it, I think.
Agent: Any rental property, boats, teenagers about to drive — anything on the horizon?
Customer: We do rent out my mother's old condo, actually.
Agent: That's important. And your home liability is $300,000 — with a rental property and two incomes, a lawsuit could reach well past that. Do you have an umbrella policy?
Customer: No, nobody's ever mentioned one.
Agent: A $1M umbrella for your profile runs about $240 a year and sits over both the house and the condo. Here's the full picture: autos at $178 a month, condo landlord policy at $940, umbrella at $240 a year. All three together still come in $310 under what you're paying now.
Customer: That's better than I expected. Can I pay the umbrella monthly, or is that annual only?
Agent: Annual on that one — but I can align its renewal with your autos so it's one predictable month. Shall I bind the package effective the 15th?
Customer: Yes, that works.
Agent: Wonderful. Documents tonight, and welcome to Anchorline.`,

  "priya-3": `Agent: Good afternoon, is this Hector? Priya calling from Anchorline about the quote request. Is now still a good time?
Customer: Yes, perfect timing, I just got off work.
Agent: How was the drive home? I saw 95 was backed up all afternoon.
Customer: Brutal. Forty minutes for twelve miles.
Agent: Ouch. Okay — before I quote anything, tell me about your situation. What are you driving, who else is on the policy, and what matters most to you: price, coverage, or service?
Customer: A 2023 RAV4, just me. Honestly, after my last claim experience? Service. My old carrier took five months on a fender bender.
Agent: Five months is unacceptable. Based on the RAV4 and your clean record, I can do $131 a month with accident forgiveness included.
Customer: That's $14 more than the online quote I got from Elephant.
Agent: It is — and here's the difference you're buying: our claims average eleven days to settle, you get me directly instead of a call center, and accident forgiveness means that first claim doesn't spike your rate. Given what you went through, is an extra $14 worth never repeating those five months?
Customer: When you frame it that way, yes.
Agent: Then let's get you set up today — I can have you covered by midnight. Sound good?
Customer: Let's do it.`,

  "priya-4": `Agent: Hi Marianne, Priya at Anchorline returning your call about the home and auto review.
Customer: Thanks for calling back so quickly.
Agent: Of course. So catch me up — what's prompting the review now?
Customer: Our premium jumped 22% at renewal and nobody at the current agency could tell us why.
Agent: That's frustrating, and worth digging into. Tell me about the house — age, roof, any updates? And the vehicles?
Customer: Built 1998, new roof in 2023, two cars, my son just got his license in March.
Agent: The new driver is most of that jump, almost certainly. New roof helps us though. I've got home at $1,720 and autos with your son rated properly at $296 a month — about 12% under your renewal.
Customer: What liability limits is that home number carrying?
Agent: Good question — I quoted $300,000 to match your current policy, though with a new driver in the house I'd recommend we talk umbrella at some point. The quote as built mirrors your coverage exactly, just cheaper.
Customer: The auto still feels high.
Agent: It does — new drivers are expensive for about three years. But there's a good-student discount if his GPA is 3.0 or better, which would take another $22 a month off. Is he a decent student?
Customer: He's got a 3.6, actually.
Agent: Then we're at $274. Shall I bind both effective your renewal date so there's no gap?
Customer: Yes, let's move forward.`,

  // ---------------- Devon Whitfield ----------------
  "devon-1": `Agent: Hi, is this Kayla? Devon from Anchorline Insurance. How's it going today?
Customer: Good, thanks! Sorry, it's loud, I'm at the dog park.
Agent: No worries, sounds like someone's having a better afternoon than us. So you asked about insuring the new Outback?
Customer: Yes! Picking it up Saturday.
Agent: Congrats. Quick questions so I rate this right: is it your daily commuter, and roughly how many miles a year? Any other drivers?
Customer: Just me, maybe 8,000 miles, mostly weekends honestly, I take the train to work.
Agent: That low-mileage profile helps you. With full coverage and a $500 deductible you're at $118 a month.
Customer: Oof. My quote from my current company was $99.
Agent: Yeah, they've got your history so they can undercut a bit.
Customer: So is there a reason I'd pay more with you?
Agent: We're local, you'd have my direct line... but yeah, $19 a month is $19. Anyway, the quote's good for 30 days if you want to think it over.
Customer: Okay, I'll keep it in mind.
Agent: Sounds good, enjoy the new car.`,

  "devon-2": `Agent: Anchorline Insurance, Devon speaking.
Customer: Hi, I got your quote by email for the townhouse. I have questions.
Agent: Sure, fire away.
Customer: Why is the dwelling coverage $310,000? I paid $265,000 for it.
Agent: Good question — that number is rebuild cost, not market price. Materials and labor to reconstruct after a total loss usually run higher than what you paid, and your lender will require it covered fully.
Customer: Hm. My cousin said I only legally need enough to cover the mortgage.
Agent: I hear that a lot, but if it's underinsured and something happens, the gap comes out of your pocket — and some policies penalize you at claim time for insuring below 80% of rebuild cost. The $310,000 protects you properly.
Customer: Okay, that actually makes sense.
Agent: While I have you — the quote came in at $1,290 a year. Want me to get the application started today so you're set before your closing?
Customer: How long does it take?
Agent: Ten minutes on this call.
Customer: Alright, let's do it now.`,

  "devon-3": `Agent: Hi Sam, Devon over at Anchorline. Thanks for sending the declarations page. How was the camping trip you mentioned?
Customer: Great, thanks for asking! Kids caught their first fish.
Agent: Love it. Okay, so I went through your current auto policy line by line. Couple of things: you're carrying rental reimbursement twice, once through the policy and once through a rider. And your comp deductible is $250, which is pricey for a 9-year-old car.
Customer: Huh. Nobody ever walked me through that.
Agent: That's what we do. Matching your real needs — dropping the duplicate rider, moving comp to $500 — I get you to $104 a month versus your current $131.
Customer: That's a decent difference... though honestly switching always feels like a hassle, and my renewal isn't until October.
Agent: Totally understandable.
Customer: I'll hang on to this and look again closer to renewal, I guess?
Agent: Sure, the quote will need a refresh by then but the structure holds. I'll email you a summary.
Customer: Perfect, thanks Devon.`,

  "devon-4": `Agent: Hi Grace, it's Devon at Anchorline, returning your call about coverage for the bakery van. How'd the farmers market go this weekend?
Customer: We sold out by noon! Best week yet.
Agent: That's fantastic. So — the van. Walk me through it: who drives it, how many days a week, and does it carry equipment or just product?
Customer: Me and one employee, six days a week, and we've got about $4,000 of racks and a warmer bolted in.
Agent: Great detail. That's commercial use with permanently attached equipment, so we quote it as a business auto with an equipment endorsement. You're looking at $212 a month, equipment included.
Customer: That's almost double my personal policy on it now.
Agent: Right — and that gap is exactly the problem. Your personal carrier can deny a claim outright once they see six-day-a-week commercial use. You'd be paying for coverage that might not pay out.
Customer: I didn't realize they could just deny it.
Agent: Happens all the time with delivery vans. For $212 you're actually covered, employee driver included. Can I bind it effective Monday so this weekend's the last one you're exposed?
Customer: Yes — I'd rather pay for real coverage.
Agent: Smart call. I'll send the paperwork within the hour.`,

  // ---------------- Aisha Coleman ----------------
  "aisha-1": `Agent: Hi, is this Mr. Okafor? This is Aisha calling from Anchorline about your auto and renters quote. Is now an okay time?
Customer: Yes, I have a few minutes.
Agent: Great. Before we get into numbers, how's the move going? You mentioned relocating for work.
Customer: Mostly boxes everywhere, but we're getting there.
Agent: I remember that phase well. So let me make sure I have this right: one car, a 2021 Camry, moving into an apartment on the east side, and you had a lapse last month when the old policy expired?
Customer: Right, exactly. The lapse worries me.
Agent: It affects the rate, but pairing auto with renters softens it. Auto comes to $142 a month and renters is $16, and the bundle discount brings the package to $149 total.
Customer: Hmm, $149. I was really hoping to stay under $130. Money's tight with the move.
Agent: I understand — moves are expensive. Here's the thing though: the lapse is what's inflating this, and it shrinks at every renewal you stay continuously covered. This $149 today is the path back to the low $120s next year. Waiting just extends the lapse.
Customer: I hadn't thought of it as fixing the lapse. Okay.
Agent: So shall we start coverage today? Ten minutes and you're done, and the clock starts on getting that rate down.
Customer: Yes, let's go ahead.`,

  "aisha-2": `Agent: Anchorline Insurance, this is Aisha. Am I speaking with Renee?
Customer: Yes, hi, I filled out the form about home insurance.
Agent: Thanks for that! How's your day been so far?
Customer: Fine, just busy.
Agent: I'll keep it efficient then. A few questions first: how old is the roof, do you have any dogs, and is anyone operating a business from the house?
Customer: Roof is 2019, one golden retriever, and no business. Oh — my husband does keep his work truck at the house, if that matters.
Agent: It might in a good way — is his auto insured separately? Bundling could earn a multi-policy discount on both.
Customer: It's through his employer actually. But our two personal cars are with State Farm.
Agent: Then there's a real bundling opportunity with those. For today: the home comes to $1,480 a year with replacement cost on contents.
Customer: Our current is $1,390, so yours is more.
Agent: Right, um — the replacement cost piece is part of that difference. It's a better policy but I know the number matters too.
Customer: We'll probably just stay put then, unless the bundle changes things?
Agent: It could — I can run the autos too and send everything together, how's that?
Customer: Sure, email works.
Agent: Great, you'll have it by tomorrow.`,

  "aisha-3": `Agent: Hi, this is Aisha from Anchorline returning your quote request for motorcycle coverage. How are you?
Customer: Good, thanks for calling back.
Agent: So I've got your info from the form — 2022 Road Glide, garage kept. The quote comes out to $61 a month for full coverage.
Customer: Okay. Does that include my gear? I've got probably $2,000 in a helmet and jackets.
Agent: Um, let me look... I believe gear coverage is an add-on.
Customer: And what about if my brother borrows it? He rides too.
Agent: Occasional permitted use is generally... it depends on the policy form.
Customer: And roadside? Towing a bike isn't like towing a car, the last company screwed that up.
Agent: There is a motorcycle roadside option, I'd have to check what it costs.
Customer: Okay... so a lot of question marks. Why don't you find those answers and email me?
Agent: I'll do that today, sorry — I wanted to get you the base number quickly.
Customer: No problem. Thanks.`,

  "aisha-4": `Agent: Hi, is this Petra? Aisha with Anchorline Insurance about the condo quote.
Customer: Yes, hi.
Agent: Great, so, I have your quote here. It's $52 a month, that's an HO-6 with $75,000 in contents and loss assessment included.
Customer: Sorry — what's loss assessment?
Agent: It's, um, coverage for when the condo association bills unit owners after a shared loss. It's included, which is good.
Customer: Okay. And is $75,000 the right amount? I honestly have no idea what my stuff is worth.
Agent: It's our standard starting point for a two-bedroom.
Customer: Alright. And the deductible?
Agent: $1,000. So that's the quote — $52 a month.
Customer: Okay, well, I'm getting two other quotes this week, so I'll compare and get back to you.
Agent: Sounds good, the quote is good for 30 days.
Customer: Thanks, bye.`,

  // ---------------- Tomas Berglund ----------------
  "tomas-1": `Agent: Anchorline, Tomas speaking.
Customer: Hi, I'm calling about the life insurance quote request I put in?
Agent: Right, I have it here. 20-year term, $500,000, based on your form you're looking at $38 a month.
Customer: Okay. Is that the best rate class? I run marathons, my resting heart rate is like 48.
Agent: The rate assumes standard health class. The exam determines the final class.
Customer: Got it. And is term right for us? My wife thought we should look at whole life for the kids.
Agent: Term is what you requested on the form.
Customer: Sure, but — I mean, is there a reason to pick one or the other?
Agent: Whole life costs more. Most people do term. So, the $38 — want to start the application?
Customer: I think I want to shop around a bit more first, honestly.
Agent: Okay. The quote's in your email.
Customer: Thanks.`,

  "tomas-2": `Agent: Tomas at Anchorline, returning a call about an auto quote.
Customer: Yes hi, that's me. For the Accord and the CR-V.
Agent: Both vehicles, full coverage, comes to $187 a month.
Customer: Hm, that's a lot. We're with Liberty at $165 right now.
Agent: Rates are up everywhere this year.
Customer: I guess... my daughter starts driving next year, does that change anything? Should we be planning for that?
Agent: It'll go up when you add her. Can't say exactly how much until we rate her.
Customer: Okay... and we've never used the roadside thing, could dropping stuff like that close the gap?
Agent: A little. Maybe $6.
Customer: Alright. Well, it doesn't sound like there's a reason to switch, then?
Agent: If Liberty's at $165, that's a decent rate.
Customer: Okay. Thanks anyway.
Agent: Sure. Bye.`,

  "tomas-3": `Agent: Hi, is this Warren? Tomas from Anchorline about your homeowners quote. How's it going?
Customer: Fine, thanks. Been waiting on this one — our renewal is next week.
Agent: Okay, so, for the house on Delancey, I've got $2,140 a year, $2,500 deductible, through Nationwide.
Customer: $2,140? We're paying $1,750 now. I filled out your form because the ad said most people save.
Agent: Home rates jumped a lot in this zip code. $2,140 is competitive for what it is.
Customer: But it's $390 more. Is the coverage at least better than what I have?
Agent: I'd have to see your current declarations to compare.
Customer: I uploaded it with the form.
Agent: Oh — let me pull that up after the call and I'll email you a comparison.
Customer: Alright. If it's just more money for the same thing, I'll stay put.
Agent: Understood. I'll send that over.
Customer: Okay, thanks.`,

  "tomas-4": `Agent: Anchorline, this is Tomas.
Customer: Hi, I requested a quote for my jet ski and boat trailer?
Agent: Yes. The PWC policy is $312 a year, trailer's covered under it up to $2,500.
Customer: Okay. Anything I should know about where I can use it? We take it to the lake house in New Hampshire in August.
Agent: Coverage applies in the US, so that's fine.
Customer: And winter storage — my neighbor's policy made him store it indoors or something?
Agent: Ours doesn't require that.
Customer: Alright. So $312.
Agent: $312, yes.
Customer: Okay, well... I'll think about it and call back if I want it.
Agent: Sounds good.
Customer: Bye.`,
};

// ---------------------------------------------------------------------------
// Template transcripts for generated (non-scripted) scored calls.
// ---------------------------------------------------------------------------

const OPENERS_RAPPORT = [
  `Agent: Hi, this is {agent} at Anchorline Insurance — thanks for taking my call. How's your week going?\nCustomer: Pretty good, thanks for asking.\nAgent: Glad to hear it.`,
  `Agent: Anchorline Insurance, {agent} speaking. Is this a good time? I know afternoons get hectic.\nCustomer: It's fine for a few minutes.\nAgent: Appreciate it — I'll be respectful of your time.`,
];
const OPENERS_FLAT = [
  `Agent: Anchorline, this is {agent}, calling about your quote request.\nCustomer: Oh, right. Okay.`,
  `Agent: This is {agent} from Anchorline returning your inquiry.\nCustomer: Yes, hi.`,
];
const DISCOVERY_YES = [
  `Agent: Before any numbers — walk me through what you have today, and what prompted the shopping?\nCustomer: Our renewal jumped and nobody could explain why.\nAgent: That's useful. Who else is on the policy, and any changes coming — new drivers, a move, anything?\nCustomer: My son gets his permit in the spring, actually.`,
  `Agent: A few questions so I quote this right: how do you mainly use the vehicle, roughly how many miles a year, and anyone else driving it?\nCustomer: Mostly commuting, about 12,000 miles, just me and my wife.`,
];
const DISCOVERY_NO = [
  `Customer: Can you just tell me the price?\nAgent: Sure, let's get right to it.`,
  `Agent: I have what you entered on the form, so let me get straight to the quote.`,
];
const QUOTE_YES = [
  `Agent: Based on that, you're looking at {price} a month with the coverage matched to what you described.\nCustomer: Okay.`,
  `Agent: The quote comes to {price} monthly, including the multi-policy discount.\nCustomer: Alright, that's in the range I expected.`,
];
const OBJECTION_HANDLED = [
  `Customer: That's more than I'm paying now, though.\nAgent: It is — and the difference is the claims service and the coverage gap we just found. Paying slightly less to stay exposed is the expensive option.\nCustomer: That's fair, I hadn't looked at it that way.`,
  `Customer: The deductible seems high.\nAgent: The lower deductible costs {delta} more per year — you'd be insuring against a swing you might use once a decade. Your call, but most clients keep this structure.\nCustomer: Okay, that makes sense.`,
];
const OBJECTION_MISSED = [
  `Customer: Honestly that's more than I wanted to spend.\nAgent: Yeah, rates are up everywhere this year.`,
  `Customer: My current company quoted less.\nAgent: They have your history, so they can do that sometimes.`,
];
const CLOSE_YES = [
  `Agent: Shall we get you covered today? It takes about ten minutes and I can make it effective immediately.\nCustomer: Yes, let's go ahead.\nAgent: Excellent — I'll start the application.`,
  `Agent: I'd suggest we bind this now so there's no gap at your renewal. Ready to move forward?\nCustomer: Sure, let's do it.`,
];
const CLOSE_NO = [
  `Customer: Let me think it over and call you back.\nAgent: Sure, the quote's good for 30 days. I'll email a summary.\nCustomer: Thanks.`,
  `Customer: I'm going to compare a couple more quotes first.\nAgent: Understood. It's all in your inbox.\nCustomer: Bye.`,
];

export function generateTranscript(rng: Rng, agentFirstName: string, steps: RubricSteps): string {
  const price = `$${100 + Math.floor(rng() * 140)}`;
  const delta = `$${120 + Math.floor(rng() * 160)}`;
  const parts = [
    pick(rng, steps.rapport ? OPENERS_RAPPORT : OPENERS_FLAT),
    pick(rng, steps.discovery ? DISCOVERY_YES : DISCOVERY_NO),
    steps.quote ? pick(rng, QUOTE_YES) : "",
    pick(rng, steps.objection ? OBJECTION_HANDLED : OBJECTION_MISSED),
    pick(rng, steps.close ? CLOSE_YES : CLOSE_NO),
  ];
  return parts
    .filter(Boolean)
    .join("\n")
    .replaceAll("{agent}", agentFirstName)
    .replaceAll("{price}", price)
    .replaceAll("{delta}", delta);
}

/** Summary sentences for generated scored calls, keyed by rubric shape. */
export function generateSummary(rng: Rng, steps: RubricSteps): string {
  const good = [
    "Warm opening and a full needs review before the quote; a price concern was reframed around coverage value and the close was accepted.",
    "Discovery surfaced an upcoming household change, the quote was tailored to it, and the call ended with a direct, successful close attempt.",
    "Complete process — rapport, thorough discovery, a matched quote, a handled objection, and a clean close.",
  ];
  const mid = [
    "Discovery and quote were solid, but a pricing objection was acknowledged without being resolved and the close never came.",
    "Good rapport and a clear quote presentation; the call drifted after a comparison objection and ended without a close attempt.",
    "Process started well but thinned out late — the objection response was generic and no commitment was asked for.",
  ];
  const low = [
    "The call went straight to price with no discovery; the caller's coverage questions went unanswered and no close was attempted.",
    "Quote was read off quickly with minimal context gathered; hesitation about the premium was left unaddressed.",
    "Little rapport and no needs assessment — the quote landed flat and the caller said they would shop around.",
  ];
  const stepCount = [steps.rapport, steps.discovery, steps.quote, steps.objection, steps.close].filter(Boolean).length;
  if (stepCount >= 5) return pick(rng, good);
  if (stepCount >= 3) return pick(rng, mid);
  return pick(rng, low);
}
