-- MemberRequest: add deposit slip URL + transaction reference number.
-- Backs the member portal "Deposit Request" feature where members upload a
-- deposit slip / bKash screenshot as proof of a deposit made to the somiti's
-- bank/MFS account. Both columns are nullable so existing rows survive.
ALTER TABLE "MemberRequest" ADD COLUMN "slipUrl" TEXT;
ALTER TABLE "MemberRequest" ADD COLUMN "transactionRef" TEXT;
