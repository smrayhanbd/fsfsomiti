-- Project manager & sponsor member relations (the scalar FK columns already
-- existed; this adds the referential constraints pointing at Member).
-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerMemberId_fkey" FOREIGN KEY ("managerMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_sponsorMemberId_fkey" FOREIGN KEY ("sponsorMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

