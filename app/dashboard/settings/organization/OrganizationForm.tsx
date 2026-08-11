"use client"

import { useTransition, useRef, useState } from "react"
import { updateOrganization } from "@/app/actions/organization"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  Building2,
  ImagePlus,
  Mail,
  Phone,
  Globe,
  MapPin,
  Scale,
  Share2,
  Save,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"

interface FormState {
  name: string
  tagline: string
  description: string
  email: string
  phone: string
  website: string
  addressLine: string
  city: string
  district: string
  postalCode: string
  regNo: string
  licenseNo: string
  tradeLicenseNo: string
  establishedYear: string
  facebook: string
  whatsapp: string
  youtube: string
}

interface InitialData extends FormState {
  logo: string | null
}

export default function OrganizationForm({ initial }: { initial: InitialData }) {
  const [isPending, startTransition] = useTransition()
  const [previewLogo, setPreviewLogo] = useState<string | null>(initial.logo)
  const [form, setForm] = useState<FormState>({
    name: initial.name, tagline: initial.tagline, description: initial.description,
    email: initial.email, phone: initial.phone, website: initial.website,
    addressLine: initial.addressLine, city: initial.city, district: initial.district, postalCode: initial.postalCode,
    regNo: initial.regNo, licenseNo: initial.licenseNo, tradeLicenseNo: initial.tradeLicenseNo, establishedYear: initial.establishedYear,
    facebook: initial.facebook, whatsapp: initial.whatsapp, youtube: initial.youtube,
  })
  const fileRef = useRef<HTMLInputElement>(null)

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData()
    ;(Object.keys(form) as (keyof FormState)[]).forEach((key) => fd.append(key, form[key]))
    if (fileRef.current?.files?.[0]) fd.append("logo", fileRef.current.files[0])
    startTransition(async () => {
      try {
        await updateOrganization(fd)
        toast.success("Organization info saved")
      } catch (error) {
        if (error instanceof Error && !error.message.includes("NEXT_REDIRECT")) {
          toast.error("Could not save", { description: error.message })
        }
      }
    })
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setPreviewLogo(URL.createObjectURL(file))
  }

  const fieldCls = "bg-[var(--control-bg)]"

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <PageHeader
        title="Organization Info"
        subtitle="This information appears on money receipts, vouchers, and member ledgers."
      />

      {/* Identity */}
      <SectionCard title="Identity" icon={<Building2 />}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Organization Name *</Label>
            <Input id="name" value={form.name} onChange={setField("name")} required className={fieldCls} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-inset">
                {previewLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewLogo} alt="Logo preview" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-8 w-8 text-faint-ink" />
                )}
              </div>
              <div className="space-y-2">
                <Input ref={fileRef} id="logo" type="file" accept="image/*" onChange={handleLogoChange} className={`${fieldCls} max-w-xs`} />
                <p className="t-caption text-muted-ink">PNG or JPG. Square works best.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline / Slogan</Label>
            <Input id="tagline" value={form.tagline} onChange={setField("tagline")} placeholder="e.g. Save today, prosper tomorrow" className={fieldCls} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Short Description</Label>
            <Textarea id="description" value={form.description} onChange={setField("description")} rows={3} placeholder="A one-paragraph description of the somiti…" className={fieldCls} />
          </div>
        </div>
      </SectionCard>

      {/* Contact + Address */}
      <SectionCard title="Contact & Address" icon={<MapPin />} accent="emerald">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email"><Mail className="mr-1 inline h-3.5 w-3.5" />Email</Label>
            <Input id="email" type="email" value={form.email} onChange={setField("email")} placeholder="info@somiti.org" className={fieldCls} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone"><Phone className="mr-1 inline h-3.5 w-3.5" />Phone</Label>
            <Input id="phone" value={form.phone} onChange={setField("phone")} placeholder="+8801XXXXXXXXX" className={fieldCls} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website"><Globe className="mr-1 inline h-3.5 w-3.5" />Website</Label>
            <Input id="website" value={form.website} onChange={setField("website")} placeholder="https://somiti.org" className={fieldCls} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine">Address Line</Label>
            <Input id="addressLine" value={form.addressLine} onChange={setField("addressLine")} placeholder="House 12, Road 5" className={fieldCls} />
          </div>
          <div className="space-y-2"><Label htmlFor="city">City / Town</Label><Input id="city" value={form.city} onChange={setField("city")} placeholder="Dhaka" className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="district">District</Label><Input id="district" value={form.district} onChange={setField("district")} placeholder="Dhaka" className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="postalCode">Postal Code</Label><Input id="postalCode" value={form.postalCode} onChange={setField("postalCode")} placeholder="1207" className={fieldCls} /></div>
        </div>
      </SectionCard>

      {/* Legal / Registration */}
      <SectionCard title="Legal / Registration" icon={<Scale />} accent="gold">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="regNo">Registration No.</Label><Input id="regNo" value={form.regNo} onChange={setField("regNo")} placeholder="Cooperative society reg. no." className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="licenseNo">License No.</Label><Input id="licenseNo" value={form.licenseNo} onChange={setField("licenseNo")} placeholder="Operating license no." className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="tradeLicenseNo">Trade License No.</Label><Input id="tradeLicenseNo" value={form.tradeLicenseNo} onChange={setField("tradeLicenseNo")} className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="establishedYear">Established Year</Label><Input id="establishedYear" value={form.establishedYear} onChange={setField("establishedYear")} placeholder="2018" className={fieldCls} /></div>
        </div>
      </SectionCard>

      {/* Social */}
      <SectionCard title="Social Links" icon={<Share2 />} accent="violet">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="facebook">Facebook</Label><Input id="facebook" value={form.facebook} onChange={setField("facebook")} placeholder="https://facebook.com/…" className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" value={form.whatsapp} onChange={setField("whatsapp")} placeholder="https://wa.me/8801…" className={fieldCls} /></div>
          <div className="space-y-2"><Label htmlFor="youtube">YouTube</Label><Input id="youtube" value={form.youtube} onChange={setField("youtube")} placeholder="https://youtube.com/…" className={fieldCls} /></div>
        </div>
      </SectionCard>

      {/* Save */}
      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <Button type="submit" disabled={isPending} className="brand-gradient shadow-lift">
          <Save className="mr-2 h-4 w-4" /> {isPending ? "Saving…" : "Save Organization Info"}
        </Button>
      </div>
    </form>
  )
}
