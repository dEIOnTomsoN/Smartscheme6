const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcrypt');
const { getDB } = require('../db'); // Import the getDB function
const sendEmail = require('../mailer'); // Import the sendEmail function
const { ObjectId } = require('mongodb');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const upload = multer({ dest: 'uploads/' });

// Home page route
router.get('/', (req, res) => {
    res.render('home');
});

// Login/Sign-Up page route
router.get('/login', (req, res) => {
    res.render('login');
});

router.get('/search', (req, res) => {
    res.render('search');
});

// Admin Login Page Route
router.get('/admin-login', (req, res) => {
    res.render('admin_login');
});

// Handle Admin Login Form Submission
router.post('/admin-login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const db = getDB();
        const adminCollection = db.collection('admin');

        // Find the admin in the database
        const admin = await adminCollection.findOne({ username });
        if (!admin) {
            return res.status(400).send("Admin not found.");
        }

        // Directly compare the provided password with the stored plain text password
        if (admin.password !== password) {
            return res.status(400).send("Invalid password.");
        }

        // Store the admin's username in the session
        req.session.adminUsername = admin.username;

        // Redirect to the admin panel
        res.redirect('/admin-panel');
    } catch (error) {
        console.error("Error during admin login:", error);
        res.status(500).send("An error occurred during admin login.");
    }
});

// Route to render the admin panel
router.get('/admin-panel', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');
        const scholarshipsCollection = db.collection('scholarships');
        const applicationsCollection = db.collection('applications');

        // Fetch total users and scholarships
        const totalUsers = await usersCollection.countDocuments();
        const totalScholarships = await scholarshipsCollection.countDocuments();

        // Fetch the number of pending applications
        const pendingFormsCount = await applicationsCollection.countDocuments({ status: 'pending' });

        res.render('admin_panel', { totalUsers, totalScholarships, pendingFormsCount });
    } catch (error) {
        console.error("Error fetching admin panel data:", error);
        res.status(500).send("An error occurred while fetching admin panel data.");
    }
});

// Handle Sign-Up Form Submission
router.post('/signup', async (req, res) => {
    const { aadhar, email, password, confirmPassword } = req.body;

    // Validate form data
    if (!aadhar || !email || !password || !confirmPassword) {
        return res.status(400).send("All fields are required.");
    }

    if (password !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
    }

    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');

        // Check if the user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).send("User already exists.");
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into the database
        await usersCollection.insertOne({
            aadhar,
            email,
            password: hashedPassword,
            profileCompleted: false, // Mark profile as incomplete
        });

        // Send a confirmation email
        const subject = 'Account Creation Successful - Smart Scheme';
        const text = `Dear User,\n\nYour account has been successfully created with the following details:\n\nEmail: ${email}\nAadhar: ${aadhar}\n\nThank you for choosing Smart Scheme!`;
        await sendEmail(email, subject, text);

        // Set the user's session after successful signup
        req.session.userEmail = email; // Add this line to set the session

        // Redirect to the user details form
        res.redirect('/user-details');
    } catch (error) {
        console.error("Error during sign-up:", error);
        res.status(500).send("An error occurred during sign-up.");
    }
});

// Handle Login Form Submission
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');

        // Find the user in the database
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(400).send("User not found.");
        }

        // Compare the provided password with the stored hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).send("Invalid password.");
        }

        // Store the user's email in the session
        req.session.userEmail = user.email;

        // Check if the user has completed the profile
        if (user.profileCompleted) {
            // Redirect to the profile page
            res.redirect('/profile');
        } else {
            // Redirect to the user details form
            res.redirect('/user-details');
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send("An error occurred during login.");
    }
});

// User Details Form Route (Pre-filled with user data if profile is completed)
router.get('/user-details', async (req, res) => {
    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');

        // Fetch the user's details from the database using the session email
        const userEmail = req.session.userEmail;
        if (!userEmail) {
            return res.status(401).send("Unauthorized. Please log in.");
        }

        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Define course types
        const courseTypes = [
            "High School",
            "Higher secondary",
            "CA/CMA/CS",
            "Diploma",
            "+1",
            "+2",
            "UG",
            "PG",
            "NURSING DIPLOMA",
            "PARAMEDICAL",
            "Degree",
            "SSLC",
            "Diploma Poly",
            "Prof course"
        ];

        // If profile is completed, pre-fill the form
        if (user.profileCompleted) {
            // Add flags for pre-selected values
            user.isMale = user.gender === "Male";
            user.isFemale = user.gender === "Female";
            user.isSC = user.category === "SC";
            user.isST = user.category === "ST";
            user.isOBC = user.category === "OBC";
            user.isMinority = user.category === "Minority";
            user.isGeneral = user.category === "General";
            user.isRomanCatholic = user.caste === "Roman Catholic";
            user.isLatinCatholic = user.caste === "Latin Catholic";
            user.isBrahmins = user.caste === "Brahmins";
            user.isEzhava = user.caste === "Ezhava";
            user.isKoyas = user.caste === "Koyas";
            user.isKerala = user.domicile_state === "Kerala";
            user.isHindu = user.religion === "Hindu";
            user.isMuslim = user.religion === "Muslim";
            user.isChristian = user.religion === "Christian";
            user.isSikh = user.religion === "Sikh";
            user.isBuddhist = user.religion === "Buddhist";
            user.isJain = user.religion === "Jain";
            user.isParsi = user.religion === "Parsi";
            user.isOtherReligion = user.religion === "Other";
            user.isStudentYes = user.is_student === "Yes";
            user.isStudentNo = user.is_student === "No";
            user.isGovInstitute = user.institute_type === "gov";
            user.isGovAidedInstitute = user.institute_type === "gov_aided";
            user.isSelfFinanceInstitute = user.institute_type === "self_finance";
            user.previousScholarshipYes = user.previous_scholarship === "1";
            user.previousScholarshipNo = user.previous_scholarship === "0";
            user.singleGirlChildYes = user.single_girl_child === "1";
            user.singleGirlChildNo = user.single_girl_child === "0";
            user.isMerit = user.admission_type === "merit";
            user.isReservation = user.admission_type === "reservation";
            user.isManagement = user.admission_type === "management";

            // Add course_type flag for pre-selected value
            user.courseTypeFlags = {};
            if (user.course_type) {
                courseTypes.forEach(course => {
                    user.courseTypeFlags[course] = course === user.course_type;
                });
            }
        }

        // Render the user details form with pre-filled data (if profile is completed) and courseTypes
        res.render('user_details', { user, courseTypes });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).send("An error occurred while fetching user details.");
    }
});

// Handle User Profile Submission
router.post('/submit-user-details', async (req, res) => {
    const userProfile = req.body;

    // Convert numeric fields to numbers
    userProfile.annual_income = parseFloat(userProfile.annual_income);
    userProfile.attendance_percentage = parseFloat(userProfile.attendance_percentage);
    userProfile.percentage_or_marks = parseFloat(userProfile.percentage_or_marks);
    userProfile.qualification_exam_score = parseFloat(userProfile.qualification_exam_score);

    // Validate required fields
    const requiredFields = [
        'email', 'first_name', 'last_name', 'gender', 'date_of_birth',
        'category', 'caste', 'domicile_state', 'religion', 'address', 'phone_number',
        'is_student', 'annual_income', 'previous_scholarship', 'single_girl_child',
        'course_type' // Ensure course_type is required
    ];
    for (const field of requiredFields) {
        if (!userProfile[field]) {
            return res.status(400).send(`Field "${field}" is required.`);
        }
    }

    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');

        // Update the user profile and mark it as completed
        await usersCollection.updateOne(
            { email: userProfile.email }, // Match by email
            { $set: { ...userProfile, profileCompleted: true } }, // Update the profile fields and mark as complete
            { upsert: false } // Do not insert a new document if not found
        );

        // Redirect to the profile page
        res.redirect('/profile');
    } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).send("An error occurred while updating the profile.");
    }
});

// Function to fetch eligible scholarships
async function getEligibleScholarships(user) {
    const db = getDB();
    const scholarshipsCollection = db.collection('scholarships');

    // Fetch all scholarships
    const scholarships = await scholarshipsCollection.find({}).toArray();

    console.log("All Scholarships:", scholarships); // Debugging: Log all scholarships

    // Filter scholarships based on user details
    const eligibleScholarships = scholarships.filter(scholarship => {
        console.log("\nChecking Scholarship:", scholarship.name); // Debugging: Log scholarship name

        // Only students are eligible for scholarships
        if (user.is_student !== "Yes") {
            console.log("Not eligible: User is not a student.");
            return false;
        }

        // Check course type (case-insensitive)
        if (scholarship.course_type && user.course_type) {
            const userCourse = user.course_type.toLowerCase();
            const scholarshipCourses = Array.isArray(scholarship.course_type)
                ? scholarship.course_type.map(course => course.toLowerCase())
                : [scholarship.course_type.toLowerCase()]; // Handle single string
            if (!scholarshipCourses.includes(userCourse)) {
                console.log(`Not eligible: Course type mismatch. User: ${userCourse}, Scholarship: ${scholarshipCourses}`);
                return false;
            }
        }

        // Check academic year (case-insensitive)
        if (scholarship.academic_year && user.academic_year) {
            const userAcademicYear = user.academic_year.toLowerCase();
            const scholarshipAcademicYears = Array.isArray(scholarship.academic_year)
                ? scholarship.academic_year.map(year => year.toString().toLowerCase())
                : [scholarship.academic_year.toString().toLowerCase()]; // Handle single string
            if (!scholarshipAcademicYears.includes(userAcademicYear)) {
                console.log(`Not eligible: Academic year mismatch. User: ${userAcademicYear}, Scholarship: ${scholarshipAcademicYears}`);
                return false;
            }
        }

        // Check category (case-insensitive)
        if (scholarship.category && user.category) {
            const userCategory = user.category.toLowerCase();
            const scholarshipCategories = Array.isArray(scholarship.category)
                ? scholarship.category.map(cat => cat.toLowerCase())
                : [scholarship.category.toLowerCase()]; // Handle single string
            if (!scholarshipCategories.includes(userCategory)) {
                console.log(`Not eligible: Category mismatch. User: ${userCategory}, Scholarship: ${scholarshipCategories}`);
                return false;
            }
        }

        // Check domicile (case-insensitive)
        if (scholarship.domicile && user.domicile_state) {
            const userDomicile = user.domicile_state.toLowerCase();
            const scholarshipDomiciles = Array.isArray(scholarship.domicile)
                ? scholarship.domicile.map(dom => dom.toLowerCase())
                : [scholarship.domicile.toLowerCase()]; // Handle single string
            if (!scholarshipDomiciles.includes(userDomicile)) {
                console.log(`Not eligible: Domicile mismatch. User: ${userDomicile}, Scholarship: ${scholarshipDomiciles}`);
                return false;
            }
        }

        // Check income limit
        if (scholarship.income_limit && user.annual_income > scholarship.income_limit) {
            console.log(`Not eligible: Income limit exceeded. User: ${user.annual_income}, Scholarship Limit: ${scholarship.income_limit}`);
            return false;
        }

        // Check gender (case-insensitive)
        if (scholarship.gender && user.gender) {
            const userGenders = Array.isArray(user.gender) ? user.gender : [user.gender]; // Ensure user.gender is an array
            const userGendersLower = userGenders.map(g => g.toLowerCase()); // Convert user genders to lowercase

            // Ensure scholarship.gender is an array
            const scholarshipGenders = Array.isArray(scholarship.gender)
                ? scholarship.gender
                : [scholarship.gender]; // Handle single string
            const scholarshipGendersLower = scholarshipGenders.map(g => g.toLowerCase()); // Convert scholarship genders to lowercase

            // Check if any user gender matches the scholarship genders
            const isGenderMatch = userGendersLower.some(g => scholarshipGendersLower.includes(g));
            if (!isGenderMatch) {
                console.log(`Not eligible: Gender mismatch. User: ${userGendersLower}, Scholarship: ${scholarshipGendersLower}`);
                return false;
            }
        }

        // Check institute type (case-insensitive)
        if (scholarship.institute_type && user.institute_type) {
            const userInstituteType = user.institute_type.toLowerCase();
            const scholarshipInstituteTypes = Array.isArray(scholarship.institute_type)
                ? scholarship.institute_type.map(type => type.toLowerCase())
                : [scholarship.institute_type.toLowerCase()]; // Handle single string
            if (!scholarshipInstituteTypes.includes(userInstituteType)) {
                console.log(`Not eligible: Institute type mismatch. User: ${userInstituteType}, Scholarship: ${scholarshipInstituteTypes}`);
                return false;
            }
        }

        // Check admission type (case-insensitive)
        if (scholarship.admission_type && user.admission_type) {
            const userAdmissionType = user.admission_type.toLowerCase();
            const scholarshipAdmissionType = scholarship.admission_type.toLowerCase();
            if (scholarshipAdmissionType !== userAdmissionType) {
                console.log(`Not eligible: Admission type mismatch. User: ${userAdmissionType}, Scholarship: ${scholarshipAdmissionType}`);
                return false;
            }
        }

        // Check qualification exam score
        if (scholarship.qualification_exam_score && user.qualification_exam_score < scholarship.qualification_exam_score) {
            console.log(`Not eligible: Qualification exam score too low. User: ${user.qualification_exam_score}, Scholarship Minimum: ${scholarship.qualification_exam_score}`);
            return false;
        }

        // Check age limit (if applicable)
        if (scholarship.age_limit) {
            const userAge = calculateAge(user.date_of_birth); // Implement a function to calculate age
            if (userAge < scholarship.age_limit.min || userAge > scholarship.age_limit.max) {
                console.log(`Not eligible: Age mismatch. User Age: ${userAge}, Scholarship Age Range: ${scholarship.age_limit.min}-${scholarship.age_limit.max}`);
                return false;
            }
        }

        console.log("Eligible for this scholarship:", scholarship.name); // Debugging: Log eligible scholarship
        return true;
    });

    console.log("Eligible Scholarships:", eligibleScholarships); // Debugging: Log all eligible scholarships
    return eligibleScholarships;
}

// Helper function to calculate age from date of birth
function calculateAge(dateOfBirth) {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

// Profile Page Route
router.get('/profile', async (req, res) => {
    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');

        // Fetch the user's details from the database using the session email
        const userEmail = req.session.userEmail;
        if (!userEmail) {
            return res.status(401).send("Unauthorized. Please log in.");
        }

        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Check if the user has completed at least three fields in the user_details form
        const requiredFields = ['first_name', 'last_name', 'gender', 'date_of_birth', 'category', 'domicile_state', 'religion', 'address', 'phone_number', 'is_student'];
        const completedFields = requiredFields.filter(field => user[field] !== undefined && user[field] !== null && user[field] !== '');

        if (completedFields.length < 3) {
            // Redirect to the home page if less than three fields are completed
            return res.redirect('/');
        }

        // Fetch eligible scholarships
        const scholarships = await getEligibleScholarships(user);

        // Convert arrays to strings for display
        const scholarshipsWithStrings = scholarships.map(scholarship => ({
            ...scholarship,
            category: scholarship.category ? scholarship.category.join(', ') : 'Not specified',
            course_type: scholarship.course_type ? scholarship.course_type.join(', ') : 'Not specified'
        }));

        // Render the profile page with scholarships
        res.render('profile', { user, scholarships: scholarshipsWithStrings });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).send("An error occurred while fetching user details.");
    }
});

// Profile View Page Route
router.get('/profile-view', async (req, res) => {
    try {
        const db = getDB();
        const usersCollection = db.collection('user_details');

        // Fetch the user's details from the database using the session email
        const userEmail = req.session.userEmail;
        if (!userEmail) {
            return res.status(401).send("Unauthorized. Please log in.");
        }

        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Add flags for conditional rendering
        user.isStudentYes = user.is_student === "Yes";
        user.previousScholarshipYes = user.previous_scholarship === "1";
        user.singleGirlChildYes = user.single_girl_child === "1";

        // Ensure course_type is passed correctly
        user.course_type = user.course_type || user.course_name; // Fallback to course_name if course_type is not set

        // Render the profile view page with user data
        res.render('profile-view', { user });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).send("An error occurred while fetching user details.");
    }
});

router.get('/all-scholarships', async (req, res) => {
    try {
        const db = getDB();
        const scholarshipsCollection = db.collection('scholarships');

        // Fetch all scholarships
        const scholarships = await scholarshipsCollection.find({}).toArray();

        // Calculate status for each scholarship
        const scholarshipsWithStatus = scholarships.map(scholarship => {
            const status = getScholarshipStatus(scholarship.deadline);
            return { ...scholarship, status };
        });

        res.json(scholarshipsWithStatus);
    } catch (error) {
        console.error("Error fetching scholarships:", error);
        res.status(500).json({ message: "An error occurred while fetching scholarships." });
    }
});

// Helper function to calculate scholarship status
function getScholarshipStatus(deadline) {
    if (!deadline) return "closed";
    const today = new Date();
    const deadlineDate = new Date(deadline);
    return deadlineDate >= today ? "open" : "closed";
}

router.get('/search-scholarships', async (req, res) => {
    try {
        const { category, gender, income_limit, domicile, qualification_exam_score, course_type, search } = req.query;
        const db = getDB();
        const scholarshipsCollection = db.collection('scholarships');

        // Build the query
        let query = {};

        // Filter by search term (scholarship name)
        if (search) {
            query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
        }

        // Filter by domicile
        if (domicile) {
            query.domicile = { $in: [domicile] };
        }

        // Filter by course type
        if (course_type) {
            query.course_type = { $in: [course_type] };
        }

        // Filter by income limit
        if (income_limit !== undefined && !isNaN(income_limit)) {
            const incomeValue = parseInt(income_limit, 10);
            query.income_limit = { $lte: incomeValue };
        }

        // Filter by qualification exam score
        if (qualification_exam_score !== undefined && !isNaN(qualification_exam_score)) {
            const qualificationValue = parseInt(qualification_exam_score, 10);
            query.qualification_exam_score = { $lte: qualificationValue };
        }

        // Fetch scholarships after applying MongoDB filters
        let results = await scholarshipsCollection.find(query).toArray();

        // Manual Category Filtering
        if (category) {
            let categoryArray = Array.isArray(category) ? category : [category];
            results = results.filter(data => data.category && data.category.some(cat => categoryArray.includes(cat)));
        }

        // Manual Gender Filtering
        if (gender) {
            results = results.filter(data => data.gender && data.gender.includes(gender));
        }

        // Convert arrays to strings for display
        const scholarshipsWithStrings = results.map(scholarship => ({
            ...scholarship,
            category: scholarship.category ? scholarship.category.join(', ') : 'Not specified',
            course_type: scholarship.course_type ? scholarship.course_type.join(', ') : 'Not specified'
        }));

        // Calculate status for each scholarship
        const scholarshipsWithStatus = scholarshipsWithStrings.map(scholarship => {
            const status = getScholarshipStatus(scholarship.deadline);
            return { ...scholarship, status };
        });

        res.json(scholarshipsWithStatus);
    } catch (error) {
        console.error('Error fetching scholarships:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Fetch detailed information about a specific scholarship
router.get('/scholarship/:id', async (req, res) => {
    try {
        const db = getDB();
        const scholarshipDescriptionCollection = db.collection('scholarship_description');
        const { id } = req.params;

        const scholarship = await scholarshipDescriptionCollection.findOne({ scholarshipID: parseInt(id) });

        if (!scholarship) {
            return res.status(404).send("Scholarship not found.");
        }

        res.json(scholarship);
    } catch (error) {
        console.error('Error fetching scholarship details:', error);
        res.status(500).send("An error occurred while fetching scholarship details.");
    }
});

// Fetch detailed information about a specific scholarship
router.get('/scholarship/details/:id', async (req, res) => {
    try {
        const db = getDB();
        const scholarshipDescriptionCollection = db.collection('scholarship_description');
        const { id } = req.params;

        const scholarship = await scholarshipDescriptionCollection.findOne({ scholarshipID: parseInt(id) });

        if (!scholarship) {
            return res.status(404).send("Scholarship not found.");
        }

        res.render('scholarship_details', { scholarship });
    } catch (error) {
        console.error('Error fetching scholarship details:', error);
        res.status(500).send("An error occurred while fetching scholarship details.");
    }
});

router.get('/add-scheme', (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    // Generate a unique scholarshipID
    const scholarshipID = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
    console.log("Rendering add_scheme_form1 with scholarshipID:", scholarshipID);
    res.render('add_scheme_form1', { scholarshipID });
});

// Handle the first form submission
router.post('/add-scheme-form1', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    const formData = req.body;
    console.log("Form Data Received:", formData);

    // Convert comma-separated strings to arrays
    formData.course_type = formData.course_type.split(',').map(item => item.trim());
    formData.category = formData.category.split(',').map(item => item.trim());
    formData.domicile = formData.domicile.split(',').map(item => item.trim());

    // Handle gender as an array
    if (formData.gender) {
        formData.gender = formData.gender.split(',').map(item => item.trim());
    }

    // Generate a unique scholarshipID as an integer
    formData.scholarshipID = Math.floor(100000 + Math.random() * 900000); // 6-digit random number

    // Handle optional fields
    if (formData.admission_type === "not_required") {
        formData.admission_type = null;
    }

    // Store form data in session for the second form
    req.session.scholarshipData = formData;
    console.log("Stored Scholarship Data in Session:", req.session.scholarshipData);

    res.redirect('/add-scheme-form2');
});

// Render the second form for adding a scholarship
router.get('/add-scheme-form2', (req, res) => {
    if (!req.session.adminUsername || !req.session.scholarshipData) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    console.log("Rendering add_scheme_form2");
    res.render('add_scheme_form2');
});

// Handle the second form submission and insert data into the database
router.post('/add-scheme-form2', async (req, res) => {
    if (!req.session.adminUsername || !req.session.scholarshipData) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    const { confirmation, ...descriptionData } = req.body;
    console.log("Confirmation Received:", confirmation);
    console.log("Description Data Received:", descriptionData);

    if (confirmation !== "CONFIRM") {
        console.log("Confirmation failed. Expected 'CONFIRM', got:", confirmation);
        return res.status(400).send("Please type 'CONFIRM' to add the scholarship.");
    }

    try {
        const db = getDB();
        const scholarshipsCollection = db.collection('scholarships');
        const descriptionCollection = db.collection('scholarship_description');

        // Insert into scholarships collection
        const scholarshipData = req.session.scholarshipData;
        console.log("Inserting into scholarships collection:", scholarshipData);
        await scholarshipsCollection.insertOne(scholarshipData);

        // Insert into scholarship_description collection
        descriptionData.scholarshipID = parseInt(scholarshipData.scholarshipID); // Ensure scholarshipID is an integer
        console.log("Inserting into scholarship_description collection:", descriptionData);
        await descriptionCollection.insertOne(descriptionData);

        // Clear session data
        req.session.scholarshipData = null;
        console.log("Scholarship data cleared from session.");

        res.redirect('/admin-panel');
    } catch (error) {
        console.error("Error adding scholarship:", error);
        res.status(500).send("An error occurred while adding the scholarship.");
    }
});

// Render the Remove Scheme Page
router.get('/remove-scheme', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    try {
        const db = getDB();
        const scholarshipsCollection = db.collection('scholarships');

        // Fetch all scholarships
        const scholarships = await scholarshipsCollection.find({}).toArray();

        // Render the remove scheme page with scholarships data
        res.render('remove_scheme', { scholarships });
    } catch (error) {
        console.error("Error fetching scholarships:", error);
        res.status(500).send("An error occurred while fetching scholarships.");
    }
});

// Handle Scholarship Search for Admin (Remove Scheme Page)
router.get('/search-scholarships-admin', async (req, res) => {
    try {
        const { search } = req.query;
        const db = getDB();
        const scholarshipsCollection = db.collection('scholarships');

        // Build the query for searching scholarships by name
        let query = {};
        if (search) {
            query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
        }

        // Fetch scholarships based on the search query
        const scholarships = await scholarshipsCollection.find(query).toArray();

        res.json(scholarships);
    } catch (error) {
        console.error("Error searching scholarships:", error);
        res.status(500).json({ message: "An error occurred while searching scholarships." });
    }
});

// Handle Scholarship Deletion
router.post('/delete-scholarship', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    const { scholarshipID, confirmation } = req.body;

    // Check if the admin typed "CONFIRM"
    if (confirmation !== "CONFIRM") {
        return res.status(400).send("Please type 'CONFIRM' to delete the scholarship.");
    }

    try {
        const db = getDB();
        const scholarshipsCollection = db.collection('scholarships');
        const descriptionCollection = db.collection('scholarship_description');

        // Convert scholarshipID to a number (if stored as a number in the database)
        const scholarshipIDNumber = parseInt(scholarshipID);

        // Delete the scholarship from the scholarships collection
        const deleteScholarshipResult = await scholarshipsCollection.deleteOne({ scholarshipID: scholarshipIDNumber });

        // Delete the scholarship description from the scholarship_description collection
        const deleteDescriptionResult = await descriptionCollection.deleteOne({ scholarshipID: scholarshipIDNumber });

        // Check if the scholarship and its description were deleted successfully
        if (deleteScholarshipResult.deletedCount === 0 || deleteDescriptionResult.deletedCount === 0) {
            return res.status(404).send("Scholarship not found or could not be deleted.");
        }

        // Redirect to the remove scheme page after successful deletion
        res.redirect('/remove-scheme');
    } catch (error) {
        console.error("Error deleting scholarship:", error);
        res.status(500).send("An error occurred while deleting the scholarship.");
    }
});

// Route to render the modify scholarship page
router.get('/modify-scheme/:id', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    try {
        const db = getDB();
        const scholarshipID = parseInt(req.params.id);

        // Fetch scholarship details from both collections
        const scholarship = await db.collection('scholarships').findOne({ scholarshipID });
        const scholarshipDescription = await db.collection('scholarship_description').findOne({ scholarshipID });

        if (!scholarship || !scholarshipDescription) {
            return res.status(404).send("Scholarship not found.");
        }

        // Render the modify page with scholarship data
        res.render('modify_scheme', { scholarship, scholarshipDescription });
    } catch (error) {
        console.error("Error fetching scholarship details:", error);
        res.status(500).send("An error occurred while fetching scholarship details.");
    }
});

// Route to handle saving modified scholarship details
router.post('/save-scheme/:id', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    try {
        const db = getDB();
        const scholarshipID = parseInt(req.params.id);
        const updatedScholarship = req.body.scholarship;
        const updatedDescription = req.body.description;

        // Update the scholarship in the scholarships collection
        await db.collection('scholarships').updateOne(
            { scholarshipID },
            { $set: updatedScholarship }
        );

        // Update the scholarship description in the scholarship_description collection
        await db.collection('scholarship_description').updateOne(
            { scholarshipID },
            { $set: updatedDescription }
        );

        // Redirect to the remove-scheme page after saving changes
        res.redirect('/remove-scheme');
    } catch (error) {
        console.error("Error updating scholarship:", error);
        res.status(500).send("An error occurred while updating the scholarship.");
    }
});

// Route to render the apply scholarship page
router.get('/apply-scholarship/:id', async (req, res) => {
    const scholarshipID = req.params.id;
    try {
        const db = getDB();
        const scholarship = await db.collection('scholarships').findOne({ scholarshipID: parseInt(scholarshipID) });
        if (!scholarship) {
            return res.status(404).send("Scholarship not found.");
        }

        const userEmail = req.session.userEmail;
        if (!userEmail) {
            return res.status(401).send("Unauthorized. Please log in.");
        }

        const user = await db.collection('user_details').findOne({ email: userEmail });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Render the apply_scholarship.hbs with user and scholarship details
        res.render('apply_scholarship', { scholarship, user });
    } catch (error) {
        console.error("Error fetching scholarship or user details:", error);
        res.status(500).send("An error occurred while fetching details.");
    }
});

router.post('/submit-application', upload.array('documents', 6), (req, res, next) => {
    if (req.files === undefined) {
        return res.status(400).send("No files were uploaded.");
    }
    next();
}, async (req, res) => {
    const formData = req.body;
    const files = req.files;

    try {
        const db = getDB();

        // Combine form data and files into a PDF
        const pdfPath = await generatePDF(formData, files);

        // Save the application to the database
        await db.collection('applications').insertOne({
            scholarshipID: formData.scholarshipID,
            userId: req.session.userEmail,
            pdfPath: pdfPath,
            status: 'pending', // Initial status
            createdAt: new Date()
        });

        res.redirect('/profile');
    } catch (error) {
        console.error("Error submitting application:", error);
        res.status(500).send("An error occurred while submitting the application.");
    }
});

async function generatePDF(formData, files) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();

    // Add form data to the PDF
    page.drawText(`Name: ${formData.firstName} ${formData.lastName}`, { x: 50, y: 750 });

    // Add uploaded files to the PDF
    for (const file of files) {
        try {
            const imageBytes = fs.readFileSync(file.path);
            const image = await pdfDoc.embedJpg(imageBytes);
            page.drawImage(image, { x: 50, y: 700, width: 100, height: 100 });
        } catch (error) {
            console.error("Error embedding image:", error);
            throw error; // Re-throw the error to be caught by the caller
        }
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    const pdfPath = path.join(__dirname, `../uploads/application_${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    return pdfPath;
}

// Route to render the verify forms page
router.get('/verify-forms', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    try {
        const db = getDB();
        const applicationsCollection = db.collection('applications');

        // Fetch pending applications
        const applications = await applicationsCollection.find({ status: 'pending' }).toArray();

        res.render('verify_forms', { applications });
    } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).send("An error occurred while fetching applications.");
    }
});

// Route to mark an application as certified
router.post('/mark-certified/:id', async (req, res) => {
    if (!req.session.adminUsername) {
        return res.status(401).send("Unauthorized. Please log in as an admin.");
    }

    try {
        const db = getDB();
        const applicationId = new ObjectId(req.params.id);

        // Fetch the application
        const application = await db.collection('applications').findOne({ _id: applicationId });
        if (!application) {
            return res.status(404).send("Application not found.");
        }

        // Add a "Certified" watermark to the PDF
        await addCertifiedWatermark(application.pdfPath);

        // Update the application status to "certified"
        await db.collection('applications').updateOne(
            { _id: applicationId },
            { $set: { status: 'certified' } }
        );

        res.sendStatus(200);
    } catch (error) {
        console.error("Error marking application as certified:", error);
        res.status(500).send("An error occurred while marking the application as certified.");
    }
});

// Function to add a "Certified" watermark to the PDF
async function addCertifiedWatermark(pdfPath) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    for (const page of pages) {
        page.drawText("CERTIFIED", {
            x: 50,
            y: 50,
            size: 30,
            color: rgb(1, 0, 0), // Red color
            opacity: 0.5,
        });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, modifiedPdfBytes);
}

// Route to download the verified PDF
router.get('/download-pdf/:id', async (req, res) => {
    try {
        const db = getDB();
        const applicationId = new ObjectId(req.params.id);

        // Fetch the application
        const application = await db.collection('applications').findOne({ _id: applicationId });
        if (!application) {
            return res.status(404).send("Application not found.");
        }

        // Check if the application is certified
        if (application.status !== 'certified') {
            return res.status(400).send("Application is not certified.");
        }

        // Serve the PDF file
        const pdfPath = application.pdfPath;
        res.download(pdfPath, 'certified_application.pdf');
    } catch (error) {
        console.error("Error downloading PDF:", error);
        res.status(500).send("An error occurred while downloading the PDF.");
    }
});

// Logout Route
router.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).send("An error occurred during logout.");
        }
        // Redirect to the home page
        res.redirect('/');
    });
});

module.exports = router;