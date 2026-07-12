import type { HooperPlay } from "./types";

/**
 * Real YouTube game / highlight film with freeze-frame decision moments.
 * Videos match Film Room (already proven embeddable in this app).
 */
export const HOOPER_PLAYS: HooperPlay[] = [
  {
    id: "iq-luka-pnr-drop",
    slug: "luka-middle-pnr-drop",
    title: "Middle PnR — Drop Coverage",
    situation:
      "Live NBA film. Ball comes into a middle pick-and-roll. Watch the big’s depth and the nail helper.",
    prompt:
      "Freeze: What’s the coverage, and what’s the correct ball-handler read? Describe it in your own words.",
    conceptTags: ["pnr", "drop_coverage"],
    difficultyIndex: 5,
    difficultyRating: 1520,
    difficultyBand: "developing",
    youtubeUrl: "https://www.youtube.com/watch?v=GRblNTXolvo",
    startAtSec: 18,
    freezeAtSec: 32,
    coverageLabel: "Drop",
    trueRead:
      "Big is in drop — protecting the paint, giving up the midrange window. Correct read: keep two feet attacking into the drop, then either pocket-pass the roller when he seals or rise into the pull-up midrange if the nail over-helps. Do not bail into a contested logo three before the screen works.",
    answerKeywords: [
      "drop",
      "pocket",
      "roller",
      "midrange",
      "pull-up",
      "paint",
      "seal",
      "nail",
      "attack",
    ],
    commonMistakes: [
      {
        triggers: ["three", "logo", "launch", "chuck", "pull from deep"],
        mistake: "Bailing into a deep three before reading the drop.",
        consequence:
          "You skip the advantage the screen created. The drop big never has to move, the roller is wasted, and you take a low-percentage shot the defense wanted you to take.",
      },
      {
        triggers: ["reject", "away from screen", "go opposite"],
        mistake: "Rejecting a useful middle screen against drop.",
        consequence:
          "You leave the roller and attack a recovered on-ball defender with no advantage — often a turnover or contested runner with help already loaded.",
      },
      {
        triggers: ["lob", "alley", "dunk immediately"],
        mistake: "Forcing a lob without sealing the drop big.",
        consequence:
          "Drop is designed to take away the lob angle. Forced lobs get tipped or contested at the rim and kill the possession.",
      },
    ],
    drawInstruction:
      "Draw the drop big’s depth and the pocket / midrange window.",
    drawExpect: ["drop big in paint", "pocket lane to roller", "midrange pull-up spot"],
    whyItMatters:
      "Drop is the most common NBA coverage — if you can’t punish it with pocket/midrange, offenses stall.",
  },
  {
    id: "iq-sideline-ice",
    slug: "sideline-ice-trap",
    title: "Sideline Screen — Ice",
    situation:
      "Ball is driven toward the sideline off a screen. Watch where the on-ball defender shades and where the big sits.",
    prompt:
      "What’s the coverage? As the ball handler, what do you do — and what do you avoid?",
    conceptTags: ["ice_defense", "pnr", "drop_coverage"],
    difficultyIndex: 6.5,
    difficultyRating: 1620,
    difficultyBand: "competitive",
    youtubeUrl: "https://www.youtube.com/watch?v=9SjvZPFiDH0",
    startAtSec: 22,
    freezeAtSec: 38,
    coverageLabel: "Ice / sideline",
    trueRead:
      "Defense is icing the ball toward the sideline (keeping the handler out of the middle) with help behind. Correct read: reject back to the middle or throw an early pocket if the roller seals — never turn the corner into the sideline trap where the baseline and sideline shrink the floor.",
    answerKeywords: [
      "ice",
      "sideline",
      "reject",
      "middle",
      "pocket",
      "trap",
      "baseline",
      "keep out of middle",
    ],
    commonMistakes: [
      {
        triggers: ["turn the corner", "attack sideline", "baseline drive", "squeeze"],
        mistake: "Turning the corner into the iced sideline.",
        consequence:
          "You run into a designed trap. Sideline + baseline become extra defenders — live-ball turnover or a rushed pass that triggers a run the other way.",
      },
      {
        triggers: ["force three", "fadeaway", "tough shot"],
        mistake: "Settling for a contested fade off ice.",
        consequence:
          "Ice exists to force tough shots. Taking them on schedule is exactly what the defense scripted — low expected points, no kick-out pressure.",
      },
    ],
    drawInstruction:
      "Draw the ice wall toward the sideline and the reject-middle / pocket option.",
    drawExpect: ["sideline ice shade", "reject back middle", "avoid turn-the-corner trap"],
    whyItMatters:
      "Sideline ice is how defenses kill empty-side ball screens. Recognizing it early saves possessions.",
  },
  {
    id: "iq-help-kick",
    slug: "drive-help-kickout",
    title: "Drive & Kick — Help Tag",
    situation:
      "Driver collapses the paint. Weak-side help tags. Watch which shooter is left alone.",
    prompt:
      "Where is the help coming from, and where should the next pass go? What’s the consequence of forcing the finish?",
    conceptTags: ["help_rotation", "kick_out", "closeout"],
    difficultyIndex: 5.5,
    difficultyRating: 1550,
    difficultyBand: "developing",
    youtubeUrl: "https://www.youtube.com/watch?v=6kW6N2Ax9XA",
    startAtSec: 12,
    freezeAtSec: 28,
    coverageLabel: "Help / rotate",
    trueRead:
      "Low man or weak-side wing is tagging the drive. Correct read: skip or kick to the vacated corner/wing before the rotation recovers — then the catch-and-shoot or one-more vs a late closeout. Forcing through help invites a charge or a rim contest and wastes the 4-on-3 you created.",
    answerKeywords: [
      "help",
      "kick",
      "skip",
      "corner",
      "weak-side",
      "closeout",
      "one-more",
      "vacated",
      "tag",
    ],
    commonMistakes: [
      {
        triggers: ["finish", "layup through", "force rim", "contact", "and-one"],
        mistake: "Forcing the finish through loaded help.",
        consequence:
          "Help is already there — you take a contested shot or charge, the weak-side shooter never touches it, and the defense resets with no closeout stress.",
      },
      {
        triggers: ["pass back", "reset", "dribble out", "waste"],
        mistake: "Bailing out of the advantage entirely.",
        consequence:
          "You had a 4-on-3. Resetting gives the defense time to recover and turns a high-value kick into an empty possession.",
      },
    ],
    drawInstruction:
      "Circle the helper and draw the skip/kick to the vacated shooter.",
    drawExpect: ["help tag", "vacated corner/wing", "kick or skip path"],
    whyItMatters:
      "Great offenses don’t just create paint touches — they punish the helper. Kick accuracy is winning basketball.",
  },
  {
    id: "iq-switch-hunt",
    slug: "switch-mismatch-hunt",
    title: "Switch — Hunt the Mismatch",
    situation:
      "Defense switches on the empty-side action. A smaller defender is now on a bigger offensive player (or vice versa).",
    prompt:
      "You got the switch. What’s the right next action — and what mistake burns the mismatch?",
    conceptTags: ["switch_defense", "mismatch", "pnr"],
    difficultyIndex: 7,
    difficultyRating: 1680,
    difficultyBand: "competitive",
    youtubeUrl: "https://www.youtube.com/watch?v=D2-ZVVxU1Wk",
    startAtSec: 15,
    freezeAtSec: 35,
    coverageLabel: "Switch",
    trueRead:
      "After the switch, clear the strong side and hunt the mismatch in space — post the smaller defender or isolate the big on an island. Don’t rush a contested three before the floor is cleared; don’t run another empty screen into the same switch without punishing the first one.",
    answerKeywords: [
      "switch",
      "mismatch",
      "clear",
      "post",
      "isolate",
      "space",
      "hunt",
      "island",
      "clear out",
    ],
    commonMistakes: [
      {
        triggers: ["quick three", "contested three", "chuck", "launch immediately"],
        mistake: "Firing a contested three before clearing space.",
        consequence:
          "You never use the mismatch. The small defender contests on the perimeter, help never has to commit, and the possession you worked for is wasted.",
      },
      {
        triggers: ["another screen", "rescreen", "same action"],
        mistake: "Re-screening into the same switch without attacking it.",
        consequence:
          "Defense is happy to keep switching. You burn clock, never force help, and hand them exactly the coverage they wanted.",
      },
    ],
    drawInstruction:
      "Box the mismatch and draw the clear-out spacing to hunt it.",
    drawExpect: ["switched mismatch", "cleared strong side", "post or iso attack"],
    whyItMatters:
      "Switches only hurt the defense if you make them guard someone they can’t. Otherwise switching is a win for them.",
  },
  {
    id: "iq-hedge-slip",
    slug: "hard-hedge-slip",
    title: "Hard Hedge — Slip / Short Roll",
    situation:
      "Big shows hard on the ball screen (hedge/blitz pressure). Watch the roller’s slip timing.",
    prompt:
      "Coverage is aggressive. What’s the throw, and what happens if you pick the ball up too high?",
    conceptTags: ["hedge_blitz", "pnr"],
    difficultyIndex: 6,
    difficultyRating: 1600,
    difficultyBand: "competitive",
    youtubeUrl: "https://www.youtube.com/watch?v=4g98FQb54No",
    startAtSec: 20,
    freezeAtSec: 40,
    coverageLabel: "Hedge / blitz",
    trueRead:
      "Hard hedge/blitz: hit the slip or short roll immediately while the big is out of the play, then one-more to the corner if the low man tags. Avoid picking up your dribble above the break — that’s when the blitz swallows the ball and forces a desperation pass.",
    answerKeywords: [
      "hedge",
      "blitz",
      "slip",
      "short roll",
      "one-more",
      "corner",
      "tag",
      "keep dribble",
      "early pass",
    ],
    commonMistakes: [
      {
        triggers: ["pick up", "hold ball", "pivot", "jump stop high", "wait"],
        mistake: "Picking the ball up above the break vs the blitz.",
        consequence:
          "Two defenders close the trap with no escape dribble. Turnover or a wild skip that becomes a free run-out the other way.",
      },
      {
        triggers: ["ignore roller", "force iso", "ignore slip"],
        mistake: "Ignoring the slip while two defenders are on the ball.",
        consequence:
          "The free man (roller) never gets the ball. Blitz succeeds, offense stagnates, and the defense rotates with numbers.",
      },
    ],
    drawInstruction:
      "Mark the hard hedge and the immediate slip / short-roll pass.",
    drawExpect: ["hedge/blitz on ball", "slip or short roll", "one-more to corner"],
    whyItMatters:
      "Aggressive coverages are beatable — but only if the pocket/slip comes early. Late = live-ball death.",
  },
  {
    id: "iq-closeout-attack",
    slug: "late-closeout-attack",
    title: "Late Closeout — Attack or Extra Pass",
    situation:
      "Ball swings. A defender is closing out late and high. Body language tells you fly-by vs short closeout.",
    prompt:
      "Read the closeout. Do you shoot, put it down, or one-more — and what’s the cost of the wrong choice?",
    conceptTags: ["closeout", "kick_out", "help_rotation"],
    difficultyIndex: 4.5,
    difficultyRating: 1480,
    difficultyBand: "intro",
    youtubeUrl: "https://www.youtube.com/watch?v=GRblNTXolvo",
    startAtSec: 55,
    freezeAtSec: 68,
    coverageLabel: "Closeout",
    trueRead:
      "Late/high closeout: catch and either rise if you’re a shooter with space, or one hard rip-through/attack into the gap if they’re flying by — then kick again if help loads. Wrong choice is pump-faking into a recovered contest or driving into a loaded help without a plan for the next pass.",
    answerKeywords: [
      "closeout",
      "shoot",
      "attack",
      "rip",
      "one-more",
      "fly-by",
      "space",
      "gap",
      "catch and shoot",
    ],
    commonMistakes: [
      {
        triggers: ["pump fake forever", "hesitate", "hold", "travel"],
        mistake: "Hesitating until the closeout recovers.",
        consequence:
          "The advantage disappears. You’re left with a contested jumper or a late drive into set help — exactly the recovery the defense wanted.",
      },
      {
        triggers: ["drive into help", "no plan", "charge into big"],
        mistake: "Attacking blind into already-loaded help.",
        consequence:
          "You turn a good swing into a charge or a kick-out under pressure. The extra pass you skipped was the layup.",
      },
    ],
    drawInstruction:
      "Mark the late closeout and your attack or catch-and-shoot decision.",
    drawExpect: ["closeout angle", "shoot or rip-through", "extra pass if help loads"],
    whyItMatters:
      "Most half-court offense is closeout reading. Get this wrong and every kick-out is empty.",
  },
];

export function conceptLabel(tag: string): string {
  const map: Record<string, string> = {
    pnr: "Pick & Roll",
    horns: "Horns",
    drop_coverage: "Drop",
    ice_defense: "Ice",
    switch_defense: "Switch",
    hedge_blitz: "Hedge/Blitz",
    transition: "Transition",
    help_rotation: "Help/Rotate",
    closeout: "Closeout",
    floppy: "Floppy",
    kick_out: "Kick-out",
    mismatch: "Mismatch",
  };
  return map[tag] ?? tag;
}

export function youtubeIdFromUrl(url: string): string | null {
  const patterns = [
    /^([a-zA-Z0-9_-]{11})$/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}
