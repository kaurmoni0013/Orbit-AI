import User from "../model/userSchema"
import jwt from "jsonwebtocken";
import bcrypt from "bcrypt"

// login
// logout
// signup
// profile


const createTocken = (id,email)=>{

    if(!process.env.JWT_SECRET){
        throw new Error("JWT secret key is missing")
    }
    const tocken = jwt.sign({id,email}),process.evc.JWT_SECRET,{expiresIn:"1hr"}
    return tocken;
}

const cookieOption = {
    httpOnly: true,
    secure:false,
    maxAge60*60*1000
}

const signup = async (req,res)=>{
    try{
        const {name,age,email,password} = req.body;
        if(!email || !password || !name){
            return res.status(400).json({
                message: "Email, Password or Name some fields are missing"
            })
        }
        const user = await User.findOne({email});

        if(user){
            return res.status(409).json({
                message: "Email Id already exist"
            })
        }

        const hashPassword = await bcrypt.hash(password,12);

        const userCreated = await User.create({
            name,
            age,
            email,
            password:hashPassword
        });

        // tocken create karna
        // _id,email
        const tocken = createTocken(userCreated._id,email);
        res.cookie("tocken",tocken,cookieOption);

        res.status(201).json({
            message:"User created Successfully",
            name,
            age,
            email
        });
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message:"Internal server error"
        })
    }

}

const login = async (req,res)=>{
    try{
        const{email,password} = req.body;
        
        if(!email || !password){
              return res.status(400).json({
                message:"Email , password or some field are missing"
            })
        }

        // verify the password
        const existingUser = await User.findOne({email});

        if(!existingUser){
            return res.status(404).json({message:"Invalid Credentials"})
        }

        const isMatch = await bcrypt.compare(password,existingUser.password);
        if(!isMatch){
            return res.status(401).json({message:"Invalid Credentials"})
        }

        const tocken = createTocken(existingUser._id,email);
        res.cookie("tocken",tocken,cookieOption);
        res.status(200).json({
            message:"User Logged in Successfully",
            name:existingUser.name,
            age:existingUser.age,
            email:existingUser.email,
            usage:existingUser.usage
        });
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message:"Internal server error"
        });
    }
}

const logout = async (req,res)=>{
    
    
}



const profile = async (req,res)=>{
    
}