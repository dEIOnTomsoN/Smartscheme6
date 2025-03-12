const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDB } = require('../db'); // Import the getDB function
const sendEmail = require('../mailer'); // Import the sendEmail function

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
// Inside the /user-details route
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
        'category', 'domicile_state', 'religion', 'address', 'phone_number',
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
            const scholarshipCourses = scholarship.course_type.map(course => course.toLowerCase());
            if (!scholarshipCourses.includes(userCourse)) {
                console.log(`Not eligible: Course type mismatch. User: ${userCourse}, Scholarship: ${scholarshipCourses}`);
                return false;
            }
        }

        // Check academic year
        if (scholarship.academic_year && user.academic_year) {
            const userAcademicYear = user.academic_year.toLowerCase();
            const scholarshipAcademicYears = Array.isArray(scholarship.academic_year)
                ? scholarship.academic_year.map(year => year.toString().toLowerCase())
                : [scholarship.academic_year.toString().toLowerCase()];

            if (!scholarshipAcademicYears.includes(userAcademicYear)) {
                console.log(`Not eligible: Academic year mismatch. User: ${userAcademicYear}, Scholarship: ${scholarshipAcademicYears}`);
                return false;
            }
        }

        // Check category
        if (scholarship.category && !scholarship.category.includes(user.category)) {
            console.log(`Not eligible: Category mismatch. User: ${user.category}, Scholarship: ${scholarship.category}`);
            return false;
        }

        // Check domicile
        if (scholarship.domicile && !scholarship.domicile.includes(user.domicile_state)) {
            console.log(`Not eligible: Domicile mismatch. User: ${user.domicile_state}, Scholarship: ${scholarship.domicile}`);
            return false;
        }

        // Check income limit
        if (scholarship.income_limit && user.annual_income > scholarship.income_limit) {
            console.log(`Not eligible: Income limit exceeded. User: ${user.annual_income}, Scholarship Limit: ${scholarship.income_limit}`);
            return false;
        }

        // Check gender
        if (scholarship.gender && !scholarship.gender.includes(user.gender)) {
            console.log(`Not eligible: Gender mismatch. User: ${user.gender}, Scholarship: ${scholarship.gender}`);
            return false;
        }

        // Check institute type
        if (scholarship.institute_type && !scholarship.institute_type.includes(user.institute_type)) {
            console.log(`Not eligible: Institute type mismatch. User: ${user.institute_type}, Scholarship: ${scholarship.institute_type}`);
            return false;
        }

        // Check admission type
        if (scholarship.admission_type && scholarship.admission_type !== user.admission_type) {
            console.log(`Not eligible: Admission type mismatch. User: ${user.admission_type}, Scholarship: ${scholarship.admission_type}`);
            return false;
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

        // Fetch eligible scholarships
        const scholarships = await getEligibleScholarships(user);

        // Render the profile page with scholarships
        res.render('profile', { user, scholarships });
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



router.get('/search-scholarships', async (req, res) => {
    try {
        const { category, gender, income_limit, domicile, qualification_exam_score, course_type } = req.query;
        const db = getDB(); // Assuming getDB() returns a connected MongoDB client
        console.log('Query Parameters:', { category, gender, income_limit, domicile, qualification_exam_score, course_type });
        // Connect to MongoDB
        const collection = db.collection('scholarships');

        // Build the query
        let query = {};

        if (domicile) {
            console.log(`Filtering by domicile: ${domicile}`);
            query.domicile = domicile;
        }
        if (course_type) {
            console.log(`Filtering by course_type: ${course_type}`);
            query.course_type = course_type;
        }
        if (income_limit !== undefined && !isNaN(income_limit)) {
            const incomeValue = parseInt(income_limit, 10);
            console.log(`Filtering by income_limit: <= ${incomeValue}`);
            query.income_limit = { $lte: incomeValue }; // Updated to income_limit
        }
        if (qualification_exam_score !== undefined && !isNaN(qualification_exam_score)) {
            const qualificationValue = parseInt(qualification_exam_score, 10);
            console.log(`Filtering by qualification_exam_score: <= ${qualificationValue}`);
            query.qualification_exam_score = { $lte: qualificationValue };
        }

        // Fetch scholarships after applying MongoDB filters
        let results = await collection.find(query).toArray();
        console.log('Snapshot Size:', results.length);

        // **Manual Category Filtering**
        if (category) {
            let categoryArray = Array.isArray(category) ? category : [category]; // Ensure it's an array
            results = results.filter(data => data.category && data.category.some(cat => categoryArray.includes(cat)));
        }

        // **Manual Gender Filtering**
        if (gender) {
            results = results.filter(data => data.gender && data.gender.includes(gender));
        }

        console.log('Filtered Results:', results);
        res.json(results);

        // Close the MongoDB connection
        
   
    } catch (error) {
        console.error('Error fetching scholarships:', error);
        res.status(500).json({ message: 'Server error' });
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