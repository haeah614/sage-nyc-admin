import { it,expect } from 'vitest';
import { aggregate } from '../lib/analytics';
import type { Plan } from '../lib/types';
it('uses actual rows, groups repeated places by ID and counts multi-valued tags once per plan',()=>{
 const plan={id:'one',title:'First',place_id:'same',place_name:'One venue',place_types:['cafe','cafe','establishment']} as Plan;
 const result=aggregate([plan,{...plan,id:'two',title:'Second'}],[{plan_id:'one',value:1,created_at:'2026-10-14T12:00:00Z'},{plan_id:'two',value:-1,created_at:'2026-10-13T12:00:00Z'}],new Date('2026-10-14T15:00:00Z'));
 expect(result.categories).toEqual([{label:'cafe',count:2}]);expect(result.places).toEqual([{label:'One venue',count:2}]);expect(result.trend).toHaveLength(30);expect(result.trend.at(-1)?.positive).toBe(1);expect(result.popular[0].id).toBe('one');
});
it('handles an empty database without fabricated counts',()=>{const result=aggregate([],[]);expect(result.categories).toEqual([]);expect(result.popular).toEqual([]);expect(result.trend.every(d=>d.positive===0&&d.negative===0)).toBe(true);});
