import {it,expect} from 'vitest';
import {teamCredentialsSchema} from '../src/lib/team/credentials';
const input={id:'00000000-0000-4000-8000-000000000001',current_password:'Owner password'};
it('requires Owner reauthentication and an email or strong new password',()=>{
 expect(teamCredentialsSchema.safeParse(input).success).toBe(false);
 expect(teamCredentialsSchema.safeParse({...input,password:'short'}).success).toBe(false);
 expect(teamCredentialsSchema.safeParse({...input,current_password:'',password:'New password 12345'}).success).toBe(false);
 expect(teamCredentialsSchema.parse({...input,email:'TECH@example.test'}).email).toBe('tech@example.test');
 expect(teamCredentialsSchema.safeParse({...input,password:'New password 12345'}).success).toBe(true);
});
it('rejects hidden role, organization and confirmation changes',()=>{for(const extra of [{role:'owner'},{organization_id:input.id},{email_confirm:true}])expect(teamCredentialsSchema.safeParse({...input,password:'New password 12345',...extra}).success).toBe(false);});
