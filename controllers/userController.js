import User from "../model/userSchema.js"
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
import {signupSchema,loginSchema} from "../validators/userValidator.js"
import Chat from "../model/chatSchema.js"
import Message from "../model/messageSchema.js"

// login
// logout
// signup
// profile


const createTocken = (id,email)=>{

    if(!process.env.JWT_SECRET){
        throw new Error("JWT secret key is missing")
    }
    const tocken = jwt.sign({id,email},process.env.JWT_SECRET,{expiresIn:"1hr"});
    return tocken;
}

const cookieOption = {
    httpOnly: true,
    secure:false,
    maxAge:60*60*1000
}

export const signup = async (req,res)=>{
    try{
        const result = signupSchema.safeParse(req.body);
    if(!result.success){
        return res.status(400).json({
            message: result.error.issues[0].message
        })
    }

        const {name,age,email,password} = result.data;

        // email exist to nahi karta
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

export const login = async (req,res)=>{
    try{

        const result = loginSchema.safeParse(req.body);
        
         if(!result.success){
        return res.status(400).json({
            message: result.error.issues[0].message
        })
    }
        const{email,password} = result.data;
        

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

export const logout = async (req,res)=>{ 

    // redis ka andar token daal do,as block listed tocken
    // "blocklist:token "
    res.clearCookie("token",{
        httpOnly:true,
        secure:false,
    });
    
    res.status(200).json({
        message:"User Logged Out Successfully"
    });
}

// export const profile = async (req,res)=>{

    // through this anyone can see my profile
    // but in chatgpt we can't access other account
    // try{
    //     const{email} = req.body;

    //     if(!email){
    //         return res.status(400).json({
    //             message:"Email is missing"
    //         })
    //     }
    //     const existingUser = await User.findOne({email});

    //     if(!existingUser){
    //         return res.json(401).json({message:"Invalid Email"})
    //     }

    //     res.status(200).json({
    //         name:existingUser.name,
    //         age:existingUser.age,
    //         usage:existingUser.usage,
    //         email:existingUser.email
    //     })
    // }
    // catch(err){
    //     console.log(err);
    //     res.status(500).json({
    //         message:"Internal server error"
    //     })
    // }

    
// }

export const profile = async (req,res)=>{
    try{
    res.status(200).json({
            name:req.user.name,
            age:req.user.age,
            usage:req.user.usage,
            email:req.user.email
        })
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message:"Internal server error"
        })
    }
}

export const deleteAccount = async (req,res)=>{
    try{
        
        // find all the chatID which belong to user

        // Delete all the messages which belongs to the chatID: Messages Delete
        // Delete all the chatID which belong to this user: Delete wo ChatID; user belong
        // Delete user Profile: is user By its ID
    const userId = req.user._id;


    await Message.deleteMany({
      userId
    });

    await Chat.deleteMany({
      userId
    });

    await User.deleteOne({
      _id: userId
    });

    res.clearCookie("token", {
      httpOnly: true,
      secure: false,
    });

    res.status(200).json({
      message: "Account deleted successfully"
    });
    }
    catch(err){
        res.status(500).json({
            messages: "Internal Server Error"
        })
    }
}