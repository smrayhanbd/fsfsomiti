"use client"

import { useState, useMemo } from "react"
import { addCollection } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { 
  Search, Calendar, Landmark, Wallet, Banknote, 
  Percent, Receipt, Tag, FileText, Printer, CheckCircle, 
  TrendingUp, ListChecks, AlertCircle 
} from "lucide-react"

interface Member { id: string, fullName: string, memberNo: string, phone: string, currentBalance: number }
interface Overview { todaysCollection: number, cashBalance: number, todaysTransactions: number }

export default function CollectionForm({ members, overview }: { members: Member[], overview: Overview }) {
  const today = new Date().toISOString().split('T')[0]
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    collectionDate: today,
    collectionType: "MONTHLY",
    depositAmount: "",
    principalAmount: "",
    interestAmount: "",
    fineAmount: "",
    otherCharges: "",
    discount: "",
    paymentMethod: "CASH",
    referenceNo: "",
    collector: "Admin",
    notes: "",
  })

  // Filtered members for search
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return []
    return members.filter(m => 
      m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.memberNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.includes(searchQuery)
    ).slice(0, 5)
  }, [searchQuery, members])

  // Real-time Calculations
  const totals = useMemo(() => {
    const deposit = parseFloat(formData.depositAmount) || 0
    const principal = parseFloat(formData.principalAmount) || 0
    const interest = parseFloat(formData.interestAmount) || 0
    const fine = parseFloat(formData.fineAmount) || 0
    const other = parseFloat(formData.otherCharges) || 0
    const discount = parseFloat(formData.discount) || 0

    const totalCollection = deposit + principal + interest + fine + other
    const netReceived = totalCollection - discount

    return { deposit, principal, interest, fine, other, discount, totalCollection, netReceived }
  }, [formData])

  // Simulate fetching member data
  const handleSelectMember = (member: Member) => {
    setSelectedMember(member)
    setSearchQuery("")
  }

  // Keyboard Navigation (Enter to move to next field)
  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>, nextFieldId?: string) => {
    if (e.key === 'Enter' && nextFieldId) {
      e.preventDefault()
      document.getElementById(nextFieldId)?.focus()
    }
  }

  const handleChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = () => {
    if (!selectedMember) {
      toast.error("Validation Error", { description: "Please select a member first." })
      return
    }
    if (totals.netReceived <= 0) {
      toast.error("Validation Error", { description: "Net received amount must be greater than zero." })
      return
    }
    setShowConfirm(true)
  }

  const confirmSave = async () => {
    setShowConfirm(false)
    const fd = new FormData()
    fd.append("memberId", selectedMember!.id)
    fd.append("amount", String(totals.netReceived))
    fd.append("type", formData.collectionType)
    fd.append("method", formData.paymentMethod)
    fd.append("date", formData.collectionDate)
    fd.append("referenceNo", formData.referenceNo)
    fd.append("notes", formData.notes)

    try {
      // Execute server action. addCollection calls redirect() on success,
      // which throws a NEXT_REDIRECT control-flow error that we must treat
      // as success (Next.js needs the throw to actually navigate).
      await addCollection(fd)
      toast.success("Collection Saved!", { description: `Receipt generated for ${selectedMember!.fullName}.` })
    } catch (error: unknown) {
      const e = error as { message?: string; digest?: string }
      if (e?.message === "NEXT_REDIRECT" || e?.digest?.startsWith("NEXT_REDIRECT")) {
        toast.success("Collection Saved!", { description: `Receipt generated for ${selectedMember!.fullName}.` })
        throw error
      }
      const msg = e?.message || "Could not save collection to database."
      toast.error("Save Failed", { description: msg })
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* LEFT & MIDDLE COLUMN: Search & Form */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Member Search */}
        <div className="space-y-2">
          <Label htmlFor="memberSearch">Quick Search (Member ID, Name, Mobile)</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              id="memberSearch" 
              placeholder="Type to search member..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white dark:bg-slate-950 h-11 text-base shadow-sm"
            />
            {filteredMembers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
                {filteredMembers.map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => handleSelectMember(m)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                      {m.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{m.fullName}</p>
                      <p className="text-xs text-slate-500">{m.memberNo} • {m.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Member Info Card */}
        {selectedMember && (
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl shadow-sm">
                  {selectedMember.fullName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedMember.fullName}</h3>
                  <p className="text-sm font-mono text-slate-500">{selectedMember.memberNo} • {selectedMember.phone}</p>
                  <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">ACTIVE</span>
                </div>
              </div>
              <div className="flex gap-8 text-right">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold">Available Balance</p>
                  <p className="text-2xl font-extrabold text-emerald-600">৳ {selectedMember.currentBalance.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Collection Entry Form */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Receipt className="h-4 w-4 text-indigo-600" /> Collection Details</h3>
          </div>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            
            <div className="space-y-2">
              <Label htmlFor="collectionDate">Collection Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="collectionDate" type="date" value={formData.collectionDate} onChange={(e) => handleChange("collectionDate", e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Collection Type</Label>
              <Select value={formData.collectionType} onValueChange={(v) => handleChange("collectionType", v ?? "")}>
                <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly Savings</SelectItem>
                  <SelectItem value="DAILY">Daily Savings</SelectItem>
                  <SelectItem value="LOAN_PAYMENT">Loan Installment</SelectItem>
                  <SelectItem value="DONATION">Donation</SelectItem>
                  <SelectItem value="FINE">Fine / Penalty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="depositAmount">Deposit Amount (Savings)</Label>
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="depositAmount" type="number" placeholder="0.00" value={formData.depositAmount} onChange={(e) => handleChange("depositAmount", e.target.value)} onKeyDown={(e) => handleEnter(e, "principalAmount")} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="principalAmount">Principal Amount (Loan)</Label>
              <div className="relative">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="principalAmount" type="number" placeholder="0.00" value={formData.principalAmount} onChange={(e) => handleChange("principalAmount", e.target.value)} onKeyDown={(e) => handleEnter(e, "interestAmount")} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interestAmount">Interest Amount</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="interestAmount" type="number" placeholder="0.00" value={formData.interestAmount} onChange={(e) => handleChange("interestAmount", e.target.value)} onKeyDown={(e) => handleEnter(e, "fineAmount")} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fineAmount">Fine Amount</Label>
              <div className="relative">
                <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="fineAmount" type="number" placeholder="0.00" value={formData.fineAmount} onChange={(e) => handleChange("fineAmount", e.target.value)} onKeyDown={(e) => handleEnter(e, "otherCharges")} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="otherCharges">Other Charges</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="otherCharges" type="number" placeholder="0.00" value={formData.otherCharges} onChange={(e) => handleChange("otherCharges", e.target.value)} onKeyDown={(e) => handleEnter(e, "discount")} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount">Discount / Rebate</Label>
              <div className="relative">
                <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="discount" type="number" placeholder="0.00" value={formData.discount} onChange={(e) => handleChange("discount", e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={formData.paymentMethod} onValueChange={(v) => handleChange("paymentMethod", v ?? "")}>
                <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BKASH">bKash</SelectItem>
                  <SelectItem value="NAGAD">Nagad</SelectItem>
                  <SelectItem value="ROCKET">Rocket</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referenceNo">Reference Number</Label>
              <Input id="referenceNo" placeholder="Txn ID / Cheque No" value={formData.referenceNo} onChange={(e) => handleChange("referenceNo", e.target.value)} className="bg-white dark:bg-slate-950" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes / Remarks</Label>
              <Input id="notes" placeholder="Optional remarks..." value={formData.notes} onChange={(e) => handleChange("notes", e.target.value)} className="bg-white dark:bg-slate-950" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT COLUMN: Summary & Actions */}
      <div className="lg:col-span-1 space-y-6">
        
        {/* Live Calculation Summary */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden sticky top-4">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Summary</h3>
          </div>
          <CardContent className="p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Savings Deposit:</span>
              <span className="font-bold text-slate-900 dark:text-white">৳ {totals.deposit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Loan Principal:</span>
              <span className="font-bold text-slate-900 dark:text-white">৳ {totals.principal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Interest:</span>
              <span className="font-bold text-slate-900 dark:text-white">৳ {totals.interest.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Fine:</span>
              <span className="font-bold text-slate-900 dark:text-white">৳ {totals.fine.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Other Charges:</span>
              <span className="font-bold text-slate-900 dark:text-white">৳ {totals.other.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-rose-600">
              <span>Discount:</span>
              <span className="font-bold">- ৳ {totals.discount.toFixed(2)}</span>
            </div>
            
            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="font-bold text-slate-900 dark:text-white">Net Received:</span>
              <span className="text-xl font-extrabold text-emerald-600">৳ {totals.netReceived.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview (Real Data) */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
           <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ListChecks className="h-4 w-4 text-indigo-600" /> Today&apos;s Overview</h3>
          </div>
          <CardContent className="p-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold">Total Collection</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">৳ {overview.todaysCollection.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold">Transactions</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{overview.todaysTransactions}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold">Cash Balance</p>
              <p className="text-lg font-bold text-emerald-600">৳ {overview.cashBalance.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button onClick={handleSave} className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 shadow-md" disabled={!selectedMember || totals.netReceived <= 0}>
            <CheckCircle className="mr-2 h-5 w-5" /> Save Collection
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-11 shadow-sm"><Printer className="mr-2 h-4 w-4" /> Save & Print</Button>
            <Button variant="outline" className="h-11 shadow-sm" onClick={() => { setSelectedMember(null); setFormData({ ...formData, depositAmount: "", principalAmount: "", interestAmount: "", fineAmount: "", otherCharges: "", discount: "" }) }}>Clear</Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Confirm Collection</h3>
              <p className="text-sm text-slate-500 mb-6">
                You are about to save a collection of <span className="font-bold text-emerald-600">৳ {totals.netReceived.toFixed(2)}</span> for <span className="font-bold">{selectedMember?.fullName}</span>.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>Cancel</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={confirmSave}>Confirm Save</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}