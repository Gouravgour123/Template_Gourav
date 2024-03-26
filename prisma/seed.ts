/* eslint-disable prettier/prettier */
// Importing necessary modules and packages

// Commander for parsing command-line options
import { Command } from 'commander'; 

// PrismaClient for database operations
import { PrismaClient } from '@prisma/client'; 

// class-validator for email validation
import { isEmail } from 'class-validator'; 

// Seed data for admin user
import { admin } from './seeds';

// Creating a new instance of Command from Commander
const program = new Command();

// Parsing command-line options
program.option('--seed-only <name>', 'Specify a seed name').parse(process.argv);

// Creating an instance of PrismaClient
const prisma = new PrismaClient();

// Main function to seed data
async function main() {
  // Getting options from command-line arguments
  const options = program.opts(); 

  // Seed admin default credential
  if (!options.seedOnly || options.seedOnly === 'admin') {
    // Checking if the admin table is empty
    if (await prisma.admin.count()) {
      console.log('⚠ Skipping seed for `admin`, due to non-empty table');
    } else {
      // Checking if admin credentials are valid
      if (
        // Validating email
        isEmail(admin.email) && 
        // Checking if passwordHash exists
        admin.meta?.create?.passwordHash && 
        // Checking if passwordSalt exists
        admin.meta.create.passwordSalt
      ) {
        // Creating admin user if credentials are valid
        await prisma.admin.create({
          data: admin,
        });
      } else {
        // Logging error if admin credentials are invalid
        console.error(new Error('Invalid default admin credentials found'));
      }
    }
  }
}

// Calling the main function
main()
// Disconnecting PrismaClient after operation
  .then(async () => {
    await prisma.$disconnect(); 
  })
  .catch(async (e) => {
    // Logging error if any
    console.error(e); 
    // Disconnecting PrismaClient after operation
    await prisma.$disconnect();
    // Exiting process with error code 1
    process.exit(1);
  });
