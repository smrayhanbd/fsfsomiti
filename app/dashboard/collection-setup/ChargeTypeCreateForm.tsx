"use client"

import { createChargeTypeConfig } from "@/app/actions/finance"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"

/**
 * Form to add a new free-form Charge Type config row. Mirrors the Collection
 * Type create form: type any name, click Add.
 */
export default function ChargeTypeCreateForm() {
  return (
    <Card className="lg:col-span-1 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 h-fit">
      <CardHeader><CardTitle>Create Charge Type</CardTitle></CardHeader>
      <CardContent>
        <form action={createChargeTypeConfig} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chargeTypeName">Type Name *</Label>
            <Input
              id="chargeTypeName"
              name="name"
              required
              placeholder="e.g., Late Deposit Fee"
            />
          </div>
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Charge Type
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
