const express = require("express");
const app = express();

app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

//registering of user
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const existingUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const existingUser = await db.get(existingUserQuery);
  if (existingUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(request.body.password, 10);
      const registeringUserQuery = `
            INSERT INTO user
            (username,password,name,gender)
            VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      const registeringUser = await db.run(registeringUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//user login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const verifyPassword = await bcrypt.compare(password, userDetails.password);
    if (verifyPassword === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//token authentication middleware
const authenticationFunction = (request, response, next) => {
  let jwtToken;
  const authToken = request.headers["authorization"];
  if (authToken !== undefined) {
    jwtToken = authToken.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const verifyToken = jwt.verify(
      jwtToken,
      "MY_SECRET",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
};

//GET tweets of Following people
app.get(
  "/user/tweets/feed/",
  authenticationFunction,
  async (request, response) => {
    const { username } = request;
    //console.log(username);
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;
    //console.log(loggedInUserId);
    const getUserTweetDetailsQuery = `
    SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
FROM follower 
INNER JOIN tweet ON follower.following_user_id = tweet.user_id
INNER JOIN user ON tweet.user_id = user.user_id
WHERE follower.follower_user_id = ${loggedInUserId}
ORDER BY dateTime DESC
LIMIT 4;`;
    const getUserTweetDetails = await db.all(getUserTweetDetailsQuery);
    response.send(getUserTweetDetails);
  }
);

//get names of people whom user follows
app.get(
  "/user/following/",
  authenticationFunction,
  async (request, response) => {
    const { username } = request;
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;
    const getFollowingsNamesQuery = `
    SELECT name
    FROM user INNER JOIN follower
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${loggedInUserId};`;
    const getFollowingNames = await db.all(getFollowingsNamesQuery);
    response.send(getFollowingNames);
  }
);

//get names of people who follow the user
app.get(
  "/user/followers/",
  authenticationFunction,
  async (request, response) => {
    const { username } = request;
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;
    const getFollowersNamesQuery = `
    SELECT name
    FROM user INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${loggedInUserId};`;
    const getFollowersNames = await db.all(getFollowersNamesQuery);
    response.send(getFollowersNames);
  }
);

//get tweet details of following person
app.get(
  "/tweets/:tweetId/",
  authenticationFunction,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;
    const getFollowingDetailsQuery = `
    SELECT tweet.tweet AS tweet, COUNT(like.tweet_id) AS likes ,COUNT(reply.tweet_id) AS replies ,tweet.date_time AS dateTime
    FROM follower 
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    INNER JOIN like ON tweet.tweet_id = like.tweet_id

    WHERE follower.follower_user_id = ${loggedInUserId} AND tweet.tweet_id = ${tweetId};`;
    const getFollowingDetails = await db.get(getFollowingDetailsQuery);
    if (getFollowingDetails.tweet === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(getFollowingDetails);
    }
  }
);

//get list of users who likes the tweet
app.get(
  "/tweets/:tweetId/likes/",
  authenticationFunction,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;
    const getLikesDetailsQuery = `
    SELECT user.username
    FROM follower
    INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    INNER JOIN like ON tweet.tweet_id = like.tweet_id
    INNER JOIN user ON like.user_id = user.user_id
    WHERE follower.follower_user_id = ${loggedInUserId} AND tweet.tweet_id = ${tweetId};`;
    const getLikesDetails = await db.all(getLikesDetailsQuery);
    const ArrayOfUserNamesObj = getLikesDetails;
    let ArrayOfUsersLiked = [];
    for (let eachObj of ArrayOfUserNamesObj) {
      ArrayOfUsersLiked.push(eachObj["username"]);
    }
    //response.send(ArrayOfUserNamesObj);
    // response.send(ArrayOfUsersLiked);
    const getNumOfTweetsQuery = `
    SELECT COUNT(tweet.tweet_id) AS NumOfTweets
    FROM follower
    INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    INNER JOIN like ON tweet.tweet_id = like.tweet_id
    INNER JOIN user ON like.user_id = user.user_id
    WHERE follower.follower_user_id = ${loggedInUserId} AND tweet.tweet_id = ${tweetId};`;
    const getNumOfTweets = await db.get(getNumOfTweetsQuery);
    //response.send(getNumOfTweets);
    if (getNumOfTweets["NumOfTweets"] > 0) {
      response.send({
        likes: ArrayOfUsersLiked,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//get list of reply details
app.get(
  "/tweets/:tweetId/replies/",
  authenticationFunction,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;
    const getLikesDetailsQuery = `
    SELECT user.name AS name, reply.reply AS reply
    FROM follower
    INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    INNER JOIN user ON reply.user_id = user.user_id
    WHERE follower.follower_user_id = ${loggedInUserId} AND tweet.tweet_id = ${tweetId};`;
    const getLikesDetails = await db.all(getLikesDetailsQuery);
    const ArrayOfUserNamesAndRepliesObj = getLikesDetails;
    // response.send(ArrayOfUserNamesAndRepliesObj);

    const getNumOfTweetsQuery = `
    SELECT COUNT(tweet.tweet_id) AS NumOfTweets
    FROM follower
    INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    INNER JOIN user ON reply.user_id = user.user_id
    WHERE follower.follower_user_id = ${loggedInUserId} AND tweet.tweet_id = ${tweetId};`;
    const getNumOfTweets = await db.get(getNumOfTweetsQuery);
    //response.send(getNumOfTweets);
    if (getNumOfTweets["NumOfTweets"] > 0) {
      response.send({
        replies: ArrayOfUserNamesAndRepliesObj,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//get all tweets of users
app.get("/user/tweets/", authenticationFunction, async (request, response) => {
  const { username } = request;
  const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
  const loggedInUser = await db.get(loggedInUserIdQuery);
  const loggedInUserId = loggedInUser.user_id;
  const userTweetsQuery = `
  SELECT tweet.tweet, COUNT(like.tweet_id) AS likes, COUNT(reply.tweet_id) AS replies, tweet.date_time AS dateTime
  FROM tweet 
  INNER JOIN user ON tweet.user_id = user.user_id
  INNER JOIN like ON tweet.tweet_id = like.tweet_id
  INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
  WHERE tweet.user_id = ${loggedInUserId}
  GROUP BY tweet.tweet_id`;
  const userTweets = await db.all(userTweetsQuery);
  response.send(userTweets);
});

//create a tweet
app.post("/user/tweets/", authenticationFunction, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
  const loggedInUser = await db.get(loggedInUserIdQuery);
  const loggedInUserId = loggedInUser.user_id;
  const dateTime = new Date();
  const createTweetQuery = `
  INSERT INTO tweet
  (tweet,user_id,date_time)
  VALUES('${tweet}',${loggedInUserId},${dateTime});`;
  const createTweet = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//delete user's tweet
app.delete(
  "/tweets/:tweetId/",
  authenticationFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const loggedInUserIdQuery = `
  SELECT user_id FROM user WHERE username = '${username}';`;
    const loggedInUser = await db.get(loggedInUserIdQuery);
    const loggedInUserId = loggedInUser.user_id;

    const getUserOfTweetIdQuery = `
  SELECT user_id
  FROM tweet
  WHERE tweet_id = ${tweetId};`;
    const getUserOfTweet = await db.get(getUserOfTweetIdQuery);
    if (getUserOfTweet["user_id"] === loggedInUserId) {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`;
      const deleteTweet = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
