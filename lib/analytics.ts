import type { Plan, Dashboard } from './types';
export function aggregate(plans: Plan[], votes: { plan_id: string; value: number; created_at: string }[], now = new Date()) {
  const categories = new Map<string, number>(), places = new Map<string, {label: string; count: number}>();
  const totals = new Map<string, {positive: number; negative: number}>();
  const days = new Map<string, { date: string; positive: number; negative: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0,10); days.set(date,{date,positive:0,negative:0});
  }
  for (const vote of votes) {
    const key = vote.value === 1 ? 'positive' : 'negative';
    const total = totals.get(vote.plan_id) || {positive:0,negative:0}; total[key]++; totals.set(vote.plan_id,total);
    const day = days.get(vote.created_at.slice(0,10)); if (day) day[key]++;
  }
  for (const plan of plans) {
    const entry = places.get(plan.place_id) || {label:plan.place_name,count:0}; entry.count++; places.set(plan.place_id,entry);
    const tags = [...new Set(plan.place_types)].filter(t => !['establishment','point_of_interest','food','store'].includes(t));
    for (const tag of tags.length ? tags : ['uncategorized']) categories.set(tag,(categories.get(tag)||0)+1);
  }
  const popular = plans.map(p => ({id:p.id,title:p.title,...(totals.get(p.id)||{positive:0,negative:0})}))
    .sort((a,b) => (b.positive-b.negative)-(a.positive-a.negative) || b.positive-a.positive).slice(0,5);
  return { trend:[...days.values()], categories:[...categories].map(([label,count])=>({label:label.replaceAll('_',' '),count})).sort((a,b)=>b.count-a.count).slice(0,7), places:[...places.values()].sort((a,b)=>b.count-a.count).slice(0,5), popular } satisfies Pick<Dashboard,'trend'|'categories'|'places'|'popular'>;
}
