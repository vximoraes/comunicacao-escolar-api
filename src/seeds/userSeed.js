import User from '../models/User.js';
import School from '../models/School.js';
import { fakeMappings } from './globalFakeMapping.js';
import bcrypt from 'bcrypt';
import seedRoutes from './routesSeed.js';
import seedGroups from './groupSeed.js';

export default async function userSeed() {
  await User.deleteMany({});

  const rotasCompletas = await seedRoutes();
  const grupos = await seedGroups(rotasCompletas);
  const userGroup = grupos.find((g) => g.nome === 'BasicUser');

  let school = await School.findOne({ active: true }).sort({ created_at: 1 });

  if (!school) {
    school = await School.create({
      name: 'Escola ComunicaAlunos',
      tax_id: '12345678000190',
      address: {
        street: 'Rua Principal',
        number: '100',
        city: 'São Paulo',
        state: 'SP',
        zip_code: '01001000',
      },
      active: true,
    });
  }

  const defaultPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || 'Senha@123',
    10,
  );

  // MOCK: Create students
  const students = [];
  for (let i = 0; i < 5; i++) {
    students.push({
      full_name: fakeMappings.User.full_name(),
      email: fakeMappings.User.email(),
      password: defaultPassword,
      active: true,
      permissions: userGroup?.permissions || [],
      groups: userGroup ? [userGroup._id] : [],
      memberships: [
        {
          school_id: school._id,
          role: 'student',
          class_id: fakeMappings.User.class_id(),
        },
      ],
    });
  }

  const createdStudents = await User.collection.insertMany(students);
  const studentIds = Object.values(createdStudents.insertedIds);

  // Create admin
  const admin = {
    full_name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL || 'admin@admin.com',
    password: defaultPassword,
    active: true,
    permissions: rotasCompletas.map((r) => r.toObject()),
    groups: grupos[0] ? [grupos[0]._id] : [],
    memberships: [
      {
        school_id: school._id,
        role: 'admin',
      },
    ],
  };

  // Create default teacher
  const defaultTeacher = {
    full_name: process.env.TEACHER_NAME || 'Maria Teacher',
    email: process.env.TEACHER_EMAIL || 'maria.teacher@escola.com',
    password: await bcrypt.hash(
      process.env.TEACHER_PASSWORD || 'Senha@123',
      10,
    ),
    active: true,
    permissions: userGroup?.permissions || [],
    groups: userGroup ? [userGroup._id] : [],
    memberships: [
      {
        school_id: school._id,
        role: 'teacher',
      },
    ],
  };

  // Create default parent
  const defaultParent = {
    full_name: process.env.PARENT_NAME || 'Ana Parent',
    email: process.env.PARENT_EMAIL || 'ana.parent@escola.com',
    password: await bcrypt.hash(process.env.PARENT_PASSWORD || 'Senha@123', 10),
    active: true,
    permissions: userGroup?.permissions || [],
    groups: userGroup ? [userGroup._id] : [],
    memberships: [
      {
        school_id: school._id,
        role: 'parent',
        associated_students: studentIds.slice(0, 2),
      },
    ],
  };

  // Create Silvio Parent
  const silvioParent = {
    full_name: 'Silvio Huan',
    email: 'silviohuan@gmail.com',
    password: defaultPassword,
    active: true,
    permissions: userGroup?.permissions || [],
    groups: userGroup ? [userGroup._id] : [],
    memberships: [
      {
        school_id: school._id,
        role: 'parent',
        associated_students: studentIds.slice(0, 2),
      },
    ],
  };

  // Create teachers
  const teachers = [];
  for (let i = 0; i < 3; i++) {
    teachers.push({
      full_name: fakeMappings.User.full_name(),
      email: fakeMappings.User.email(),
      password: defaultPassword,
      active: true,
      permissions: userGroup?.permissions || [],
      groups: userGroup ? [userGroup._id] : [],
      memberships: [
        {
          school_id: school._id,
          role: 'teacher',
        },
      ],
    });
  }

  // Create parents
  const parents = [];
  for (let i = 0; i < 3; i++) {
    // Each parent linked to 1-2 students
    const linkedStudents = studentIds.slice(
      i,
      Math.min(i + 2, studentIds.length),
    );

    parents.push({
      full_name: fakeMappings.User.full_name(),
      email: fakeMappings.User.email(),
      password: defaultPassword,
      active: true,
      permissions: userGroup?.permissions || [],
      groups: userGroup ? [userGroup._id] : [],
      memberships: [
        {
          school_id: school._id,
          role: 'parent',
          associated_students: linkedStudents,
        },
      ],
    });
  }

  // Insert all users
  const allUsers = [
    admin,
    defaultTeacher,
    defaultParent,
    silvioParent,
    ...teachers,
    ...parents,
  ];
  const result = await User.collection.insertMany(allUsers);

  const createdAdmin = await User.findOne({
    email: process.env.ADMIN_EMAIL || 'admin@admin.com',
  });
  const createdDefaultTeacher = await User.findOne({
    email: process.env.TEACHER_EMAIL || 'maria.teacher@escola.com',
  });
  const createdDefaultParent = await User.findOne({
    email: process.env.PARENT_EMAIL || 'ana.parent@escola.com',
  });
  const createdSilvioParent = await User.findOne({
    email: 'silviohuan@gmail.com',
  });

  console.log(`School created: ${school.name} (${school._id})`);
  console.log(`Admin: ${createdAdmin.email}`);
  console.log(
    `Default teacher: ${createdDefaultTeacher.email} (${createdDefaultTeacher._id})`,
  );
  console.log(
    `Default parent: ${createdDefaultParent.email} (${createdDefaultParent._id})`,
  );
  console.log(
    `Silvio parent: ${createdSilvioParent.email} (${createdSilvioParent._id})`,
  );
  console.log(`${teachers.length} fake teachers created`);
  console.log(`${parents.length} fake parents created`);
  console.log(`${students.length} students created`);

  return {
    adminId: createdAdmin._id,
    schoolId: school._id,
    defaultTeacherId: createdDefaultTeacher._id,
    defaultParentId: createdDefaultParent._id,
    users: result,
  };
}
