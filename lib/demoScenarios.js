// Invented demo conversations for the one-click buttons on the customer page.
// All names, numbers and accounts are synthetic.

export const DEMO_SCENARIOS = [
  {
    id: "authority",
    label: "Officer on a call",
    payeeId: "PAYEE-1004",
    amount: "95000",
    conversation: `[10:02] Unknown: This is Inspector R. Verma, Cyber Crime Cell. A parcel booked with your ID contains illegal items. A case has been registered against you.
[10:03] Unknown: To avoid arrest you must cooperate. Do not disconnect and do not tell anyone, this is a confidential investigation.
[10:05] Me: I did not send any parcel. What should I do?
[10:06] Unknown: Transfer your savings to the safe custody verification account for checking. The amount will be refunded within 2 hours after verification.
[10:06] Unknown: Send Rs 95,000 now to account 50100987654321. If it is not done in 30 minutes an arrest warrant will be issued.
[10:07] Unknown: Also tell me the OTP you receive, 448210, for verification.`,
  },
  {
    id: "investment",
    label: "Investment group",
    payeeId: "PAYEE-1005",
    amount: "50000",
    conversation: `Alpha Wealth Club (214 members)
Prof. Anil: Today's VIP signal gave 38% profit in 2 days!
Member Kavya: Withdrew 1,20,000 profit today, thank you Professor!
Member Sunil: Got 3x returns this week, sharing screenshot
Prof. Anil: Guaranteed returns. Our insider IPO allotment window closes tonight. Minimum 50,000 to join the VIP plan.
Me: Can I start with a smaller amount first?
Assistant Ritu: Sir, below 50,000 we cannot allot. Pay to the collection account shared by our team and send the screenshot. Only 5 seats left.`,
  },
  {
    id: "rent",
    label: "Monthly rent",
    payeeId: "PAYEE-1001",
    amount: "18500",
    conversation: `Meera (landlord): Hi Arun, a reminder that October rent of 18,500 is due on the 5th. Same account as always.
Me: Sure aunty, I will transfer tomorrow morning. Also the kitchen tap is leaking a bit.
Meera: Thanks! I will send the plumber on Saturday. No hurry on the rent, by the 5th is fine.`,
  },
];
