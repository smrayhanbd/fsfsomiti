import prisma from "@/lib/prisma"
import { plain } from "@/lib/serialize"
import { createChargeType } from "@/app/actions/finance"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FeeSetupForm from "./FeeSetupForm"
import CollectionTypeManager from "./CollectionTypeManager"
import ChargeTypeCreateForm from "./ChargeTypeCreateForm"
import ChargeTypeConfigManager from "./ChargeTypeConfigManager"
import { History, PlusCircle, Tag, Trash2 } from "lucide-react"

export const dynamic = 'force-dynamic'

export default async function CollectionSetupPage() {
  // 1. Fetch Setups, Charge Types, and Active Members
  const setups = await prisma.feeSetup.findMany({
    orderBy: { effectiveDate: "desc" },
  })

  const chargeTypes = await prisma.chargeType.findMany({
    orderBy: { name: "asc" },
  })

  // 2a. Fetch Charge Type configs (backs the "Charge Type" tab).
  const chargeTypeConfigs = await prisma.chargeTypeConfig.findMany({
    orderBy: { name: "asc" },
  })

  // Which charge type names are already snapshotted on transactions? Used to
  // disable deletion of charge types that are in use.
  const usedChargeTypeConfigs = await prisma.transaction.findMany({
    where: { transactionType: "CHARGE", NOT: { chargeTypeName: null } },
    select: { chargeTypeName: true },
    distinct: ["chargeTypeName"],
  })
  const usedChargeNames = usedChargeTypeConfigs.map((t) => t.chargeTypeName as string)

  const activeMembers = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fullName: true, memberNo: true },
    orderBy: { fullName: "asc" },
  })

  // Get a list of all type names currently used in setups (for the delete safety check)
  const usedNames = setups.map(s => s.name)

  const formatDueDay = (freq: string, day: number) => {
    if (freq === "WEEKLY") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      return days[day] || "N/A"
    }
    return `${day}`
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Fees & Collection Setup</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Define collection rules, deadlines, and manage collection types.</p>
      </div>

      <Tabs defaultValue="declare" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 bg-slate-100 dark:bg-slate-900">
          <TabsTrigger value="declare">Declare Collection/Fees</TabsTrigger>
          <TabsTrigger value="types">Collection Type</TabsTrigger>
          <TabsTrigger value="charge-types">Charge Type</TabsTrigger>
        </TabsList>

        {/* Tab 1: Declare Collection/Fees */}
        <TabsContent value="declare" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Form takes 1/3 width */}
            <div className="lg:col-span-1">
              <FeeSetupForm chargeTypes={plain(chargeTypes)} members={activeMembers} />
            </div>

            {/* History Table takes 2/3 width */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" /> Collection Setup History
              </h2>
              
              <Card className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto w-full">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Name</TableHead>
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Amount</TableHead>
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Effective Date</TableHead>
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Frequency</TableHead>
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Due Day</TableHead>
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Fine Amount</TableHead>
                          <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 whitespace-nowrap">Target</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {setups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-slate-500">No setups declared yet.</TableCell>
                          </TableRow>
                        ) : (
                          setups.map((setup) => (
                            <TableRow key={setup.id} className="border-b border-slate-100 dark:border-slate-800">
                              <TableCell className="px-4 py-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">{setup.name}</TableCell>
                              <TableCell className="px-4 py-4 font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">৳ {Number(setup.amount).toLocaleString()}</TableCell>
                              <TableCell className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap">{new Date(setup.effectiveDate).toLocaleDateString()}</TableCell>
                              <TableCell className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap">{setup.frequency}</TableCell>
                              <TableCell className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap">{formatDueDay(setup.frequency, setup.dueDay)}</TableCell>
                              <TableCell className="px-4 py-4 text-sm font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
                                {setup.hasFine ? `৳ ${Number(setup.fineAmount).toLocaleString()}` : "N/A"}
                              </TableCell>
                              <TableCell className="px-4 py-4 whitespace-nowrap">
                                {setup.targetType === "ALL" ? (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">All Members</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">Specific Members</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Collection Type */}
        <TabsContent value="types" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Create Collection Type Form */}
            <Card className="lg:col-span-1 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 h-fit">
              <CardHeader><CardTitle>Create Collection Type</CardTitle></CardHeader>
              <CardContent>
                <form action={createChargeType} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="typeName">Type Name *</Label>
                    <Input id="typeName" name="name" required placeholder="e.g., Monthly Savings" />
                  </div>
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Type
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Collection Types List (Client Component) */}
            <CollectionTypeManager chargeTypes={plain(chargeTypes)} usedNames={usedNames} />
          </div>
        </TabsContent>

        {/* Tab 3: Charge Type */}
        <TabsContent value="charge-types" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-8">
            <ChargeTypeCreateForm />

            <ChargeTypeConfigManager
              configs={plain(chargeTypeConfigs).map((c: { id: string; name: string; isActive: boolean }) => ({
                id: c.id,
                name: c.name,
                isActive: c.isActive,
              }))}
              usedNames={usedChargeNames}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}