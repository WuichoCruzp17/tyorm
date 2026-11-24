import '@tyorm/core/register';

import {
    Column, Entity, getEntityMetadata, JoinColumn, JoinTable,
    ManyToMany, ManyToOne, OneToMany, OneToOne, OrmMetadataModel,
    PrimaryKey, QuerySemanticResolver
} from '@tyorm/core';

@Entity({ schema: 'pg_temp', name: 'demo_departments' })
export class Department {
    @PrimaryKey({ type: 'integer', name: 'department_id' })
    id!: number;

    @Column({ type: 'string' })
    name!: string;

    @OneToMany(() => Employee, 'department')
    employees!: Employee[];
}

@Entity({ schema: 'pg_temp', name: 'demo_profiles' })
export class Profile {
    @PrimaryKey({ type: 'integer', name: 'profile_id' })
    id!: number;

    @Column({ type: 'string' })
    location!: string;
}

@Entity({ schema: 'pg_temp', name: 'demo_roles' })
export class Role {
    @PrimaryKey({ type: 'integer', name: 'role_id' })
    id!: number;

    @Column({ type: 'string' })
    title!: string;

    @Column({ type: 'integer' })
    level!: number;

    @ManyToMany(() => Employee, 'roles')
    employees!: Employee[];
}

@Entity({ schema: 'pg_temp', name: 'demo_employees' })
export class Employee {
    @PrimaryKey({ type: 'integer', name: 'employee_id' })
    id!: number;

    @Column({ type: 'string', name: 'display_name' })
    name!: string;

    @Column({ type: 'boolean' })
    active!: boolean;

    @ManyToOne(() => Department, 'employees')
    @JoinColumn({ name: 'department_fk', referencedColumnName: 'department_id' })
    department!: Department;

    @OneToOne(() => Profile)
    @JoinColumn({ name: 'profile_fk', referencedColumnName: 'profile_id' })
    profile!: Profile;

    @ManyToMany(() => Role, 'employees')
    @JoinTable({
        name: 'demo_employee_roles',
        schema: 'pg_temp',
        joinColumns: [{ name: 'employee_fk', referencedColumnName: 'employee_id' }],
        inverseJoinColumns: [{ name: 'role_fk', referencedColumnName: 'role_id' }]
    })
    roles!: Role[];
}

export const resolver = new QuerySemanticResolver(new OrmMetadataModel([
    getEntityMetadata(Department),
    getEntityMetadata(Profile),
    getEntityMetadata(Role),
    getEntityMetadata(Employee)
]));
