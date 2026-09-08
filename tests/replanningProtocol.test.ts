import { expect, it } from 'vitest'
import { parseExecutionRequest, parseReplanningRequest } from '../supabase/functions/secretary-api/replanning-contract'
const id='11111111-1111-4111-8111-111111111111'
it('execution boundary rejects ownership and preserves caller retry identifiers',()=>{
  const v={operation:'record_task_action',event_id:id,plan_item_id:id,expected_state:'planned',action:'partial',occurred_at:'2026-09-08T00:00:00Z',progress_percent:50}
  expect(parseExecutionRequest(v)).toEqual(v)
  expect(parseExecutionRequest({...v,user_id:id})).toBeNull()
  expect(parseExecutionRequest({...v,occurred_at:'invalid'})).toBeNull()
})
it('carryover needs explicit bounded source decisions',()=>{
  const v={operation:'replan_daily_plan',proposal:{plan_date:'2026-09-08',context_token:'a'.repeat(64),base_plan_id:id,capacity_minutes:60,buffer_percent:20,buffer_reason:null,brief:'Synthetic time loss',items:[]},decisions:[{source_item_id:id,decision:'omit',reason:'Capacity loss; reconsider when unblocked'}]}
  expect(parseReplanningRequest(v)).toEqual(v)
  expect(parseReplanningRequest({...v,decisions:[...v.decisions,...v.decisions]})).toBeNull()
})
