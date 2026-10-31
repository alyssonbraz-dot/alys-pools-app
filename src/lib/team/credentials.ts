import {z} from 'zod';
export const teamCredentialsSchema=z.object({
 id:z.uuid(),
 current_password:z.string().min(1).max(128),
 email:z.email().max(254).transform(value=>value.trim().toLowerCase()).optional(),
 password:z.string().min(16).max(128).optional(),
}).strict().refine(value=>value.email!==undefined||value.password!==undefined,{message:'Email or password required.'});
