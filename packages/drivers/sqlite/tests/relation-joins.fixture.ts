import '@tyorm/core/register';

import {
    Column,
    Entity,
    getEntityMetadata,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    OneToOne,
    OrmMetadataModel,
    PrimaryKey,
    QuerySemanticResolver
} from '@tyorm/core';

@Entity({ name: 'join_departments' })
export class Department {
    @PrimaryKey({ type: 'integer', name: 'department_id' })
    id!: number;

    @PrimaryKey({ type: 'integer', name: 'region_id' })
    regionId!: number;

    @Column({ type: 'string', name: 'department_name' })
    name!: string;

    @OneToMany(() => Employee, 'department')
    employees!: Employee[];
}

@Entity({ name: 'join_employees' })
export class Employee {
    @PrimaryKey({ type: 'string', name: 'employee_id' })
    id!: string;

    @PrimaryKey({ type: 'integer', name: 'tenant_id' })
    tenantId!: number;

    @Column({ type: 'string', name: 'employee_name' })
    name!: string;

    @ManyToOne(() => Department, 'employees')
    @JoinColumn([
        { name: 'department_fk', referencedColumnName: 'department_id' },
        { name: 'region_fk', referencedColumnName: 'region_id' }
    ])
    department!: Department;

    @OneToOne(() => Badge, 'employee')
    @JoinColumn({ name: 'badge_fk', referencedColumnName: 'badge_id' })
    badge!: Badge | null;

    @ManyToMany(() => Role, 'employees')
    @JoinTable({
        name: 'employee_roles',
        joinColumns: [
            { name: 'employee_fk', referencedColumnName: 'employee_id' },
            { name: 'tenant_fk', referencedColumnName: 'tenant_id' }
        ],
        inverseJoinColumns: [
            { name: 'role_fk', referencedColumnName: 'role_id' }
        ]
    })
    roles!: Role[];
}

@Entity({ name: 'join_badges' })
export class Badge {
    @PrimaryKey({ type: 'integer', name: 'badge_id' })
    id!: number;

    @Column({ type: 'string', name: 'badge_label' })
    label!: string;

    @OneToOne(() => Employee, 'badge')
    employee!: Employee;
}

@Entity({ name: 'join_roles' })
export class Role {
    @PrimaryKey({ type: 'integer', name: 'role_id' })
    id!: number;

    @Column({ type: 'string', name: 'role_name' })
    name!: string;

    @ManyToMany(() => Employee, 'roles')
    employees!: Employee[];
}

export function createRelationResolver(): QuerySemanticResolver {
    return new QuerySemanticResolver(new OrmMetadataModel([
        getEntityMetadata(Department),
        getEntityMetadata(Employee),
        getEntityMetadata(Badge),
        getEntityMetadata(Role)
    ]));
}
